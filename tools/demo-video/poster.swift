// A still of the video to lead with: a frame of the app behind a layer, so the icon, the name and
// one line read over it whatever the code underneath is doing. The type is the film's, so the poster
// and its title card are the same picture. POSTER_BLUR (sigma at 4K, 0 for none) and POSTER_SCRIM
// (0 to 1) set how much of the app survives it.
// usage: poster.swift <frame.png> <icon.png> <out.png> [title] [line]
import AppKit
import CoreImage

func fail(_ message: String) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(1)
}

let args = Array(CommandLine.arguments.dropFirst())
guard args.count >= 3 else { fail("poster.swift <frame.png> <icon.png> <out.png> [title] [line]") }
guard let frame = NSImage(contentsOfFile: args[0]),
      let source = frame.cgImage(forProposedRect: nil, context: nil, hints: nil) else { fail("no frame at \(args[0])") }
guard let icon = NSImage(contentsOfFile: args[1]) else { fail("no icon at \(args[1])") }
let title = args.count >= 4 ? args[3] : "Code Tiles"
let line = args.count >= 5 ? args[4] : "Every project you're working on, in one window."
let settings = ProcessInfo.processInfo.environment
let blurSigma = Double(settings["POSTER_BLUR"] ?? "") ?? 10
let scrimAlpha = Double(settings["POSTER_SCRIM"] ?? "") ?? 0.62

let size = CGSize(width: source.width, height: source.height)
// Everything below is written for a 4K frame and scales with the one it is given.
let scale = size.height / 2160

// Clamped before the blur, or the edges darken as it samples past them.
let sharp = CIImage(cgImage: source)
var glass = source
if blurSigma > 0 {
  let soft = sharp.clampedToExtent().applyingGaussianBlur(sigma: blurSigma * scale).cropped(to: sharp.extent)
  guard let blurred = CIContext().createCGImage(soft, from: sharp.extent) else { fail("could not blur the frame") }
  glass = blurred
}

let poster = NSImage(size: size, flipped: false) { rect in
  NSGraphicsContext.current?.cgContext.draw(glass, in: rect)
  NSColor(srgbRed: 0.03, green: 0.035, blue: 0.043, alpha: scrimAlpha).setFill()
  rect.fill()
  let centre = CGPoint(x: rect.midX, y: rect.midY + 40 * scale)
  // Darker still behind the type, which lands wherever the frame happens to be busiest.
  if let pool = NSGradient(colors: [NSColor(white: 0, alpha: 0.5), NSColor(white: 0, alpha: 0)]) {
    pool.draw(fromCenter: centre, radius: 0, toCenter: centre, radius: rect.width * 0.44, options: [])
  }

  let name = NSAttributedString(string: title, attributes: [
    .font: NSFont.systemFont(ofSize: 172 * scale, weight: .bold), .foregroundColor: NSColor.white, .kern: -2.0 * scale,
  ])
  let under = NSAttributedString(string: line, attributes: [
    .font: NSFont.systemFont(ofSize: 64 * scale, weight: .regular), .foregroundColor: NSColor(white: 0.88, alpha: 1),
  ])
  let iconSide = 400 * scale
  let gap = 56 * scale
  let block = iconSide + gap + name.size().height + 18 * scale + under.size().height
  var y = centre.y + block / 2 - iconSide

  icon.draw(in: CGRect(x: rect.midX - iconSide / 2, y: y, width: iconSide, height: iconSide))
  y -= gap + name.size().height
  name.draw(at: CGPoint(x: rect.midX - name.size().width / 2, y: y))
  y -= 18 * scale + under.size().height
  under.draw(at: CGPoint(x: rect.midX - under.size().width / 2, y: y))
  return true
}

guard let data = poster.tiffRepresentation, let bitmap = NSBitmapImageRep(data: data),
      let png = bitmap.representation(using: .png, properties: [:]) else { fail("could not encode the poster") }
try! png.write(to: URL(fileURLWithPath: args[2]))
print("\(args[2]) (\(Int(size.width))x\(Int(size.height)), blur \(blurSigma), scrim \(scrimAlpha))")
