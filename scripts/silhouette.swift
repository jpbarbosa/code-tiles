// Traces the outline of a rendered icon into "x y" canvas-pixel points.
//
// macOS 26's chiclet is a continuous squircle, so no circular radius reproduces it - measured on
// a 1024 render its corner runs 317px along each edge while the radius a circle would imply swings
// between 67 and 102. Reading the shape back out of ictool costs one render and stays right if
// Apple reshapes it.
//
// Sampled by ANGLE, not by row. A row scan has no resolution where the boundary runs near
// horizontal: at the top of the corner it put 77px between neighbouring points, so the curve
// arrived as a handful of long facets and the tiles cut from it had visibly straight, sharp
// corners. Angular sampling spaces points evenly all the way round.
//
//     swift scripts/silhouette.swift <render.png> <out.txt>

import AppKit

let args = CommandLine.arguments
guard args.count == 3, let img = NSImage(contentsOfFile: args[1]),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("usage: silhouette.swift <render.png> <out.txt>\n".data(using: .utf8)!)
    exit(1)
}
let w = cg.width, h = cg.height
var buf = [UInt8](repeating: 0, count: w * h * 4)
let ctx = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))

// The shadow ictool bakes is softer than the body, so the edge is taken high enough to ignore it.
let solid = 200
// Bilinear, not nearest: sampled at integer pixels the boundary quantises to +/-0.5px, and at the
// ~6px spacing these points sit at, that jitter swings the surface normal enough to put spikes in
// anything derived from it.
func alpha(_ xi: Int, _ yi: Int) -> Double {
    guard xi >= 0, yi >= 0, xi < w, yi < h else { return 0 }
    return Double(buf[(yi * w + xi) * 4 + 3])
}
func inside(_ x: Double, _ y: Double) -> Bool {
    let x0 = Int(x.rounded(.down)), y0 = Int(y.rounded(.down))
    let fx = x - Double(x0), fy = y - Double(y0)
    let top = alpha(x0, y0) * (1 - fx) + alpha(x0 + 1, y0) * fx
    let bottom = alpha(x0, y0 + 1) * (1 - fx) + alpha(x0 + 1, y0 + 1) * fx
    return top * (1 - fy) + bottom * fy >= Double(solid)
}

let cx = Double(w) / 2, cy = Double(h) / 2
let samples = 720
var points: [(Double, Double)] = []
for i in 0..<samples {
    let a = 2 * Double.pi * Double(i) / Double(samples)
    let dx = cos(a), dy = sin(a)
    var lo = 0.0, hi = Double(max(w, h))          // centre is inside, hi is beyond any corner
    guard inside(cx, cy) else { break }
    for _ in 0..<24 {                              // binary search to sub-pixel
        let mid = (lo + hi) / 2
        if inside(cx + dx * mid, cy + dy * mid) { lo = mid } else { hi = mid }
    }
    points.append((cx + dx * lo, cy + dy * lo))
}
guard points.count == samples else {
    FileHandle.standardError.write("no silhouette found\n".data(using: .utf8)!); exit(1)
}

let text = points.map { String(format: "%.3f %.3f", $0.0, $0.1) }.joined(separator: "\n")
try! text.write(toFile: args[2], atomically: true, encoding: .utf8)
let jumps = zip(points, points.dropFirst() + points.prefix(1)).map { hypot($1.0 - $0.0, $1.1 - $0.1) }
print(String(format: "traced %d points from %dx%d, largest step %.1f px", points.count, w, h,
             jumps.max() ?? 0))
