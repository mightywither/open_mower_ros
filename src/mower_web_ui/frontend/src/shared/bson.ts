// Minimal BSON encoder for a flat object of doubles.
// The xbot_monitoring bridge decodes the `teleop` payload with json::from_bson,
// so we must send BSON (not JSON text) for { vx, vz }.
export function encodeBsonDoubles(obj: Record<string, number>): Uint8Array {
  const enc = new TextEncoder()
  const body: number[] = []
  for (const [key, value] of Object.entries(obj)) {
    body.push(0x01) // element type: double (float64)
    for (const b of enc.encode(key)) body.push(b)
    body.push(0x00) // key cstring terminator
    const buf = new ArrayBuffer(8)
    new DataView(buf).setFloat64(0, value, true) // little-endian
    for (const b of new Uint8Array(buf)) body.push(b)
  }
  body.push(0x00) // document terminator

  const total = body.length + 4 // + int32 length prefix
  const out = new Uint8Array(total)
  new DataView(out.buffer).setInt32(0, total, true)
  out.set(body, 4)
  return out
}
