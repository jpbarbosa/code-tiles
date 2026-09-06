// Turns one full-bleed ictool render into a .iconset.
//
// ictool always fills its canvas edge to edge, but a .icns is drawn in the Dock at whatever size
// it declares, so a full-bleed one sits ~11% larger than every neighbour. macOS 26's own apps ship
// their legacy icns at 206/256 of the canvas with a soft shadow in the margin, which is what this
// reproduces.
//
//     swift scripts/iconset.swift <source.png> <out.iconset>

import AppKit

let CONTENT_RATIO = 206.0 / 256.0

let args = CommandLine.arguments
guard args.count == 3, let source = NSImage(contentsOfFile: args[1]) else {
    FileHandle.standardError.write("usage: iconset.swift <source.png> <out.iconset>\n".data(using: .utf8)!)
    exit(1)
}
let outDir = args[2]
try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

// Every entry a .icns wants, as (canvas, filename). Several share a canvas size.
let entries: [(Int, String)] = [
    (16, "icon_16x16.png"), (32, "icon_16x16@2x.png"),
    (32, "icon_32x32.png"), (64, "icon_32x32@2x.png"),
    (128, "icon_128x128.png"), (256, "icon_128x128@2x.png"),
    (256, "icon_256x256.png"), (512, "icon_256x256@2x.png"),
    (512, "icon_512x512.png"), (1024, "icon_512x512@2x.png"),
]

var rendered: [Int: Data] = [:]

for (canvas, name) in entries {
    if rendered[canvas] == nil {
        let side = (Double(canvas) * CONTENT_RATIO).rounded()
        let inset = (Double(canvas) - side) / 2
        let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: canvas, pixelsHigh: canvas,
                                   bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                   colorSpaceName: .deviceRGB, bytesPerRow: canvas * 4, bitsPerPixel: 32)!
        NSGraphicsContext.saveGraphicsState()
        let ctx = NSGraphicsContext(bitmapImageRep: rep)!
        NSGraphicsContext.current = ctx
        ctx.imageInterpolation = .high
        // Matches the ramp Apple's own icns carry outside the chiclet: shallow, dark, sitting low.
        let shadow = NSShadow()
        shadow.shadowBlurRadius = Double(canvas) * 0.035
        shadow.shadowOffset = NSSize(width: 0, height: -Double(canvas) * 0.012)
        shadow.shadowColor = NSColor.black.withAlphaComponent(0.32)
        shadow.set()
        source.draw(in: NSRect(x: inset, y: inset, width: side, height: side),
                    from: .zero, operation: .sourceOver, fraction: 1)
        NSGraphicsContext.restoreGraphicsState()
        rendered[canvas] = rep.representation(using: .png, properties: [:])!
    }
    try! rendered[canvas]!.write(to: URL(fileURLWithPath: "\(outDir)/\(name)"))
}
print("wrote \(entries.count) renditions into \(outDir)")
