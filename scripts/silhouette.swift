// Traces the outline of a rendered icon into "x y" canvas-pixel points.
//
// macOS 26's chiclet is a continuous squircle, so no circular radius reproduces it - measured on
// a 1024 render its corner runs 317px along each edge while the radius a circle would imply swings
// between 67 and 102. Reading the shape back out of ictool costs one render and stays right if
// Apple reshapes it.
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
func alpha(_ x: Int, _ y: Int) -> Int { Int(buf[(y * w + x) * 4 + 3]) }

// The shadow ictool bakes is softer than the body, so the edge is taken high enough to ignore it.
let solid = 200
var left: [(Double, Double)] = [], right: [(Double, Double)] = []
let step = max(1, h / 256)
for y in stride(from: 0, to: h, by: step) {
    var lo = 0
    while lo < w && alpha(lo, y) < solid { lo += 1 }
    guard lo < w else { continue }
    var hi = w - 1
    while hi > lo && alpha(hi, y) < solid { hi -= 1 }
    left.append((Double(lo), Double(y)))
    right.append((Double(hi) + 1, Double(y)))
}
guard left.count > 8 else {
    FileHandle.standardError.write("no silhouette found\n".data(using: .utf8)!); exit(1)
}

let outline = left + right.reversed()
let text = outline.map { String(format: "%.2f %.2f", $0.0, $0.1) }.joined(separator: "\n")
try! text.write(toFile: args[2], atomically: true, encoding: .utf8)
print("traced \(outline.count) points from \(w)x\(h)")
