const EPOCH = 1420070400000n;
const WORKER = BigInt(process.pid & 31) << 17n;

let lastMs = 0n;
let seq = 0n;

const build = (ms, worker, sequence) => (((BigInt(ms) - EPOCH) << 22n) | worker | BigInt(sequence)).toString();

function snowflake(time = Date.now()) {
  let ms = BigInt(time);
  if (ms <= lastMs) {
    ms = lastMs;
    seq = (seq + 1n) & 4095n;
    if (seq === 0n) ms += 1n;
  } else {
    seq = 0n;
  }
  lastMs = ms;
  return build(ms, WORKER, seq);
}

const snowflakeAt = (ms, sequence) => build(ms, 0n, sequence);

const isSnowflake = (id) => /^\d{17,20}$/.test(String(id));
const timeOf = (id) => Number((BigInt(id) >> 22n) + EPOCH);

module.exports = { snowflake, snowflakeAt, isSnowflake, timeOf };
