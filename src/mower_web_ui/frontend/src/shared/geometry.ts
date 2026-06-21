export interface XY {
  x: number
  y: number
}

function perpendicularDistance(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  // Distance from point p to the line a-b
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len
}

// Douglas–Peucker polyline simplification. `tolerance` is in metres.
export function simplify(points: XY[], tolerance: number): XY[] {
  if (points.length <= 2) return points.slice()

  let maxDist = 0
  let index = 0
  const end = points.length - 1
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end])
    if (d > maxDist) {
      maxDist = d
      index = i
    }
  }

  if (maxDist > tolerance) {
    const left = simplify(points.slice(0, index + 1), tolerance)
    const right = simplify(points.slice(index), tolerance)
    return left.slice(0, -1).concat(right)
  }
  return [points[0], points[end]]
}

// Shoelace area of a polygon ring, in the same (metric) units as the points.
export function polygonArea(points: XY[]): number {
  let a = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    a += points[i].x * points[j].y - points[j].x * points[i].y
  }
  return Math.abs(a / 2)
}

// Simplify a closed polygon ring (keeps it closed-ish; Leaflet auto-closes).
export function simplifyRing(points: XY[], tolerance: number): XY[] {
  if (points.length <= 4) return points.slice()
  const simplified = simplify(points, tolerance)
  // Guarantee a usable polygon
  return simplified.length >= 3 ? simplified : points.slice()
}
