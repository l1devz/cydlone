window.createVoice = function createVoice({ socket, onChange, onError }) {
  const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
  const GATE_OPEN_DB = -52;
  const SPEAKING_DB = -48;
  const GATE_HOLD_MS = 250;

  const PREF_KEY = 'cydlone:voice';
  const prefs = {
    noiseSuppression: true,
    echoCancellation: true,
    micId: '',
    camId: '',
    ...(() => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; } })(),
  };
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {  } };

  const st = {
    channelId: null, serverId: null, selfId: null, connecting: false,
    muted: false, deafened: false, video: false, screen: false, screenAudio: false,
  };
  const peers = new Map();
  const speaking = new Set();

  let ctx = null;
  let rawStream = null;
  let source = null;
  let rawAnalyser = null;
  let gate = null;
  let dest = null;
  let outStream = null;
  let camTrack = null;
  let screenTrack = null;
  let screenAudioTrack = null;
  let screenStream = null;
  let meterTimer = null;
  let gateClosedAt = 0;

  const changed = (type = 'state') => onChange?.(type);

  function levelDb(analyser) {
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    return rms > 0 ? 20 * Math.log10(rms) : -100;
  }

  function mediaError(e, kind) {
    const video = kind === 'video';
    if (e?.name === 'NotAllowedError') {
      return video
        ? 'Tarayıcı kameraya erişime izin vermedi. Adres çubuğundaki site ayarlarından izin ver.'
        : 'Tarayıcı mikrofona erişime izin vermedi. Adres çubuğundaki site ayarlarından izin ver.';
    }
    if (e?.name === 'NotFoundError') return video ? 'Kamera bulunamadı.' : 'Mikrofon bulunamadı.';
    if (e?.name === 'NotReadableError') {
      return video ? 'Kamera başka bir uygulama tarafından kullanılıyor olabilir.' : 'Mikrofon başka bir uygulama tarafından kullanılıyor olabilir.';
    }
    return video ? 'Kamera açılamadı.' : 'Mikrofon açılamadı.';
  }

  function chime(up) {
    if (!ctx) return;
    const t = ctx.currentTime;
    [up ? 660 : 880, up ? 880 : 660].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.08, t + i * 0.1 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.1 + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(t + i * 0.1);
      o.stop(t + i * 0.1 + 0.2);
    });
  }

  async function openMic() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: prefs.micId ? { exact: prefs.micId } : undefined,
        noiseSuppression: prefs.noiseSuppression,
        echoCancellation: prefs.echoCancellation,
        autoGainControl: true,
      },
    });
    ctx ||= new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    if (!gate) {
      gate = ctx.createGain();
      rawAnalyser = ctx.createAnalyser();
      rawAnalyser.fftSize = 1024;
      dest = ctx.createMediaStreamDestination();
      gate.connect(dest);
    }
    source?.disconnect();
    rawStream?.getTracks().forEach((t) => t.stop());
    rawStream = stream;
    source = ctx.createMediaStreamSource(stream);
    source.connect(rawAnalyser);
    source.connect(gate);
  }

  function startMeter() {
    clearInterval(meterTimer);
    meterTimer = setInterval(() => {
      const next = new Set();
      if (rawAnalyser) {
        const db = levelDb(rawAnalyser);
        if (prefs.noiseSuppression) {
          const now = performance.now();
          if (db > GATE_OPEN_DB) gateClosedAt = now + GATE_HOLD_MS;
          const open = now < gateClosedAt;
          gate.gain.setTargetAtTime(open ? 1 : 0, ctx.currentTime, open ? 0.01 : 0.08);
        } else {
          gate.gain.setTargetAtTime(1, ctx.currentTime, 0.01);
        }
        if (!st.muted && !st.deafened && db > SPEAKING_DB) next.add('self');
      }
      peers.forEach((p, id) => { if (p.analyser && levelDb(p.analyser) > SPEAKING_DB) next.add(id); });
      const same = next.size === speaking.size && [...next].every((x) => speaking.has(x));
      if (!same) {
        speaking.clear();
        next.forEach((x) => speaking.add(x));
        changed('speaking');
      }
    }, 60);
  }

  function applyMute() {
    const track = dest?.stream.getAudioTracks()[0];
    if (track) track.enabled = !(st.muted || st.deafened);
    peers.forEach((p) => {
      if (p.audio) p.audio.muted = st.deafened;
      if (p.screenAudio) p.screenAudio.muted = st.deafened || !!p.streamMuted;
    });
  }

  const audioBox = document.createElement('div');
  audioBox.hidden = true;
  document.body.append(audioBox);

  function createPeer(socketId, userId) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer = {
      pc, userId, stream: new MediaStream(), audio: null, analyser: null,
      polite: st.selfId > socketId, makingOffer: false, ignoreOffer: false, videoSender: null,
    };
    peers.set(socketId, peer);

    outStream.getTracks().forEach((t) => {
      const sender = pc.addTrack(t, outStream);
      if (t.kind === 'video') peer.videoSender = sender;
    });
    if (screenTrack) peer.screenSender = pc.addTrack(screenTrack, screenStream);
    if (screenAudioTrack) peer.screenAudioSender = pc.addTrack(screenAudioTrack, screenStream);

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        socket.emit('voice:signal', { to: socketId, data: { description: pc.localDescription } });
      } catch (e) {
        console.warn('Ses: teklif oluşturulamadı', e);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('voice:signal', { to: socketId, data: { candidate } });
    };
    pc.ontrack = ({ track, streams }) => {
      const remote = streams[0];
      if (track.kind === 'audio' && remote && !peer.mainId) peer.mainId = remote.id;
      const isScreen = remote
        && (peer.mainId ? remote.id !== peer.mainId : track.kind === 'video' && remote.getAudioTracks().length === 0);
      if (isScreen) {
        peer.screen = remote;
        if (track.kind === 'audio') attachScreenAudio(peer, track);
        track.addEventListener('ended', changed);
        changed();
        return;
      }
      peer.stream.addTrack(track);
      track.addEventListener('ended', () => { peer.stream.removeTrack(track); changed(); });
      if (track.kind === 'audio' && !peer.audio) {
        peer.audio = Object.assign(document.createElement('audio'), { autoplay: true, srcObject: peer.stream });
        peer.audio.muted = st.deafened;
        if (prefs.outputId && peer.audio.setSinkId) peer.audio.setSinkId(prefs.outputId).catch(() => {});
        audioBox.append(peer.audio);
        peer.audio.play().catch(() => {});
        const src = ctx.createMediaStreamSource(new MediaStream([track]));
        peer.analyser = ctx.createAnalyser();
        peer.analyser.fftSize = 1024;
        src.connect(peer.analyser);
      }
      changed();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce();
      changed();
    };
    return peer;
  }

  function attachScreenAudio(peer, track) {
    peer.screenAudio?.remove();
    peer.screenAudio = Object.assign(document.createElement('audio'), { autoplay: true, srcObject: new MediaStream([track]) });
    peer.screenAudio.muted = st.deafened || !!peer.streamMuted;
    if (prefs.outputId && peer.screenAudio.setSinkId) peer.screenAudio.setSinkId(prefs.outputId).catch(() => {});
    audioBox.append(peer.screenAudio);
    peer.screenAudio.play().catch(() => {});
  }

  function closePeer(socketId) {
    const peer = peers.get(socketId);
    if (!peer) return;
    peer.pc.close();
    peer.audio?.remove();
    peer.screenAudio?.remove();
    peers.delete(socketId);
    speaking.delete(socketId);
  }

  socket.on('voice:signal', async ({ from, userId, data }) => {
    if (!st.channelId || !outStream) return;
    const peer = peers.get(from) || createPeer(from, userId);
    const { pc } = peer;
    try {
      if (data.description) {
        const collision = data.description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(data.description);
        if (data.description.type === 'offer') {
          await pc.setLocalDescription();
          socket.emit('voice:signal', { to: from, data: { description: pc.localDescription } });
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (e) {
          if (!peer.ignoreOffer) throw e;
        }
      }
    } catch (e) {
      console.warn('Ses: sinyal işlenemedi', e);
    }
  });

  socket.on('voice:peer-left', ({ socketId }) => {
    closePeer(socketId);
    changed();
  });

  socket.on('voice:kicked', ({ reason } = {}) => {
    leave({ notify: false });
    if (reason) onError?.(reason);
  });

  socket.on('disconnect', () => {
    if (st.channelId) {
      leave({ notify: false });
      onError?.('Bağlantı koptu, ses kanalından ayrıldın.');
    }
  });

  async function join(channelId, serverId) {
    if (st.channelId === channelId || st.connecting) return;
    if (st.channelId) leave({ notify: true, sound: false });
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      onError?.('Bu tarayıcı sesli sohbeti desteklemiyor.');
      return;
    }
    st.connecting = true;
    changed();
    try {
      await openMic();
    } catch (e) {
      st.connecting = false;
      changed();
      onError?.(mediaError(e, 'audio'));
      return;
    }
    outStream = new MediaStream([dest.stream.getAudioTracks()[0]]);

    const res = await new Promise((resolve) => socket.timeout(8000).emit(
      'voice:join', { channelId, muted: st.muted, deafened: st.deafened },
      (err, r) => resolve(err ? { error: 'Ses sunucusuna ulaşılamadı.' } : r),
    ));
    st.connecting = false;
    if (res?.error) {
      stopMedia();
      changed();
      onError?.(res.error);
      return;
    }
    Object.assign(st, { channelId, serverId, selfId: res.selfId });
    res.peers.forEach((p) => createPeer(p.socketId, p.userId));
    applyMute();
    startMeter();
    chime(true);
    changed();
  }

  function stopMedia() {
    clearInterval(meterTimer);
    source?.disconnect();
    rawStream?.getTracks().forEach((t) => t.stop());
    camTrack?.stop();
    screenTrack?.stop();
    rawStream = null;
    source = null;
    camTrack = null;
    screenTrack = null;
    screenStream = null;
    outStream = null;
    st.video = false;
    st.screen = false;
    speaking.clear();
  }

  function leave({ notify = true, sound = true } = {}) {
    if (!st.channelId) return;
    if (notify) socket.emit('voice:leave');
    [...peers.keys()].forEach(closePeer);
    stopMedia();
    if (sound) chime(false);
    Object.assign(st, { channelId: null, serverId: null, selfId: null });
    changed();
  }

  function sendState() {
    if (st.channelId) socket.emit('voice:update', { muted: st.muted, deafened: st.deafened, video: st.video, screen: st.screen });
  }

  function toggleMute() {
    if (st.deafened) { st.deafened = false; st.muted = false; } else st.muted = !st.muted;
    applyMute();
    sendState();
    changed();
  }

  function toggleDeafen() {
    st.deafened = !st.deafened;
    applyMute();
    sendState();
    changed();
  }

  async function toggleCamera() {
    if (!st.channelId) return;
    if (st.video) {
      camTrack?.stop();
      outStream.getVideoTracks().forEach((t) => outStream.removeTrack(t));
      peers.forEach((p) => p.videoSender?.replaceTrack(null));
      camTrack = null;
      st.video = false;
    } else {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: prefs.camId ? { exact: prefs.camId } : undefined,
            width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 },
          },
        });
      } catch (e) {
        onError?.(mediaError(e, 'video'));
        return;
      }
      if (!st.channelId) { stream.getTracks().forEach((t) => t.stop()); return; }
      camTrack = stream.getVideoTracks()[0];
      camTrack.addEventListener('ended', () => { if (st.video) toggleCamera(); });
      outStream.addTrack(camTrack);
      peers.forEach((p) => {
        if (p.videoSender) p.videoSender.replaceTrack(camTrack);
        else p.videoSender = p.pc.addTrack(camTrack, outStream);
      });
      st.video = true;
    }
    sendState();
    changed();
  }

  async function toggleScreen() {
    if (!st.channelId) return;
    if (st.screen) {
      screenTrack?.stop();
      screenStream?.getTracks().forEach((t) => screenStream.removeTrack(t));
      peers.forEach((p) => p.screenSender?.replaceTrack(null));
      screenTrack = null;
      st.screen = false;
    } else {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        onError?.('Bu tarayıcı ya da cihaz ekran paylaşımını desteklemiyor.');
        return;
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30, max: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch (e) {
        if (e?.name !== 'NotAllowedError' && e?.name !== 'AbortError') onError?.('Ekran paylaşımı başlatılamadı.');
        return;
      }
      if (!st.channelId) { stream.getTracks().forEach((t) => t.stop()); return; }
      screenTrack = stream.getVideoTracks()[0];
      screenTrack.contentHint = 'detail';
      screenTrack.addEventListener('ended', () => { if (st.screen) toggleScreen(); });
      screenStream ||= new MediaStream();
      screenStream.addTrack(screenTrack);
      peers.forEach((p) => {
        if (p.screenSender) p.screenSender.replaceTrack(screenTrack);
        else p.screenSender = p.pc.addTrack(screenTrack, screenStream);
      });
      st.screen = true;
    }
    sendState();
    changed();
  }

  async function setPref(key, value) {
    prefs[key] = value;
    savePrefs();
    if (st.channelId && ['noiseSuppression', 'echoCancellation', 'micId'].includes(key)) {
      try {
        await openMic();
      } catch (e) {
        onError?.(mediaError(e, 'audio'));
      }
    }
    if (key === 'outputId') peers.forEach((p) => p.audio?.setSinkId?.(value).catch(() => {}));
    changed();
  }

  async function listDevices() {
    try {
      return await navigator.mediaDevices.enumerateDevices();
    } catch {
      return [];
    }
  }

  return {
    get state() { return { ...st }; },
    get prefs() { return { ...prefs }; },
    join,
    leave: () => leave(),
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreen,
    canShareScreen: () => !!navigator.mediaDevices?.getDisplayMedia,
    setPref,
    listDevices,
    isSpeaking: (id) => speaking.has(id === st.selfId ? 'self' : id),
    videoStream(socketId) {
      if (socketId === st.selfId) return camTrack ? new MediaStream([camTrack]) : null;
      const peer = peers.get(socketId);
      const track = peer?.stream.getVideoTracks()[0];
      return track ? peer.stream : null;
    },
    screenStreamOf(socketId) {
      if (socketId === st.selfId) return screenTrack ? new MediaStream([screenTrack]) : null;
      const s = peers.get(socketId)?.screen;
      return s && s.getVideoTracks().some((t) => t.readyState === 'live') ? s : null;
    },
    connectionState: (socketId) => peers.get(socketId)?.pc.connectionState || null,
  };
};
