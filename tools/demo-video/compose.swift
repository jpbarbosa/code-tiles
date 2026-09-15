// The take, framed: reads the raw window capture and a timeline, writes the finished video - a
// backdrop, the window under a camera that can push in, a cursor, captions and an end card.
// Everything is drawn with CoreGraphics in a top-left space: canvas pixels, or window points.
//
//   compose <timeline.json>                     the video
//   compose <timeline.json> --stills <dir> t…   PNGs of single output frames, for checking
import AppKit
import AVFoundation
import CoreGraphics
import CoreVideo

setvbuf(stdout, nil, _IOLBF, 0)

func fail(_ message: String) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(1)
}

struct Timeline: Decodable {
  struct Segment: Decodable { let from: Double; let to: Double; let speed: Double }
  struct Text: Decodable {
    let at: Double, until: Double, text: String
    let sub: String?, style: String?
    // A label's anchor, in window points: it rides the camera with the thing it names.
    let x: Double?, y: Double?
  }
  struct CursorKey: Decodable { let t: Double; let x: Double; let y: Double; let click: Bool?; let hide: Bool? }
  struct CameraKey: Decodable { let t: Double; let x: Double; let y: Double; let w: Double; let ease: Double? }
  struct Card: Decodable { let duration: Double; let title: String; let subtitle: String; let icon: String? }
  let source: String
  let output: String
  let window: [Double]
  let segments: [Segment]
  let texts: [Text]
  let cursor: [CursorKey]
  let camera: [CameraKey]
  let outro: Card?
  let fps: Int?
}

// MARK: - time

// Output time is what the viewer sees; source time is the take's own. Segments play pieces of the
// take in order, each at its own speed, and whatever lies between two segments is cut.
struct Clock {
  let segments: [Timeline.Segment]
  let starts: [Double]
  let total: Double

  init(_ segments: [Timeline.Segment]) {
    self.segments = segments
    var running = 0.0
    var starts: [Double] = []
    for segment in segments {
      starts.append(running)
      running += (segment.to - segment.from) / segment.speed
    }
    self.starts = starts
    total = running
  }

  func source(_ output: Double) -> Double {
    for (index, segment) in segments.enumerated().reversed() where output >= starts[index] {
      return min(segment.to, segment.from + (output - starts[index]) * segment.speed)
    }
    return segments.first?.from ?? 0
  }

  func output(_ source: Double) -> Double {
    for (index, segment) in segments.enumerated() {
      if source < segment.from { return starts[index] }
      if source <= segment.to { return starts[index] + (source - segment.from) / segment.speed }
    }
    return total
  }
}

func smooth(_ x: Double) -> Double {
  let t = max(0, min(1, x))
  return t * t * (3 - 2 * t)
}

func mix(_ a: Double, _ b: Double, _ t: Double) -> Double { a + (b - a) * t }

// MARK: - source frames

final class Frames {
  private let output: AVAssetReaderTrackOutput
  private let reader: AVAssetReader
  private var current: CMSampleBuffer?
  private var upcoming: CMSampleBuffer?
  private var origin = 0.0

  init(url: URL) async throws {
    let asset = AVURLAsset(url: url)
    guard let track = try await asset.loadTracks(withMediaType: .video).first else { fail("no video track in \(url.path)") }
    reader = try AVAssetReader(asset: asset)
    output = AVAssetReaderTrackOutput(track: track, outputSettings: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    ])
    output.alwaysCopiesSampleData = false
    reader.add(output)
    guard reader.startReading() else { fail("reader: \(reader.error?.localizedDescription ?? "unknown")") }
    upcoming = output.copyNextSampleBuffer()
    origin = upcoming?.presentationTimeStamp.seconds ?? 0
  }

  // Monotonic: the take is only ever read forwards, which is what lets a sped-up segment skip.
  func frame(at time: Double) -> CVPixelBuffer? {
    while let next = upcoming, next.presentationTimeStamp.seconds - origin <= time {
      current = next
      upcoming = output.copyNextSampleBuffer()
    }
    return (current ?? upcoming).flatMap(CMSampleBufferGetImageBuffer)
  }
}

// MARK: - drawing helpers

let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!
let bgra = CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue

func color(_ hex: UInt32, _ alpha: Double = 1) -> CGColor {
  CGColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255,
          blue: CGFloat(hex & 0xff) / 255, alpha: CGFloat(alpha))
}

// Upright in a flipped context, which CGContext.draw alone is not.
func drawImage(_ context: CGContext, _ image: CGImage, in rect: CGRect) {
  context.saveGState()
  context.translateBy(x: rect.minX, y: rect.maxY)
  context.scaleBy(x: 1, y: -1)
  context.draw(image, in: CGRect(origin: .zero, size: rect.size))
  context.restoreGState()
}

func image(of buffer: CVPixelBuffer) -> CGImage? {
  guard let base = CVPixelBufferGetBaseAddress(buffer) else { return nil }
  let bytes = CVPixelBufferGetBytesPerRow(buffer) * CVPixelBufferGetHeight(buffer)
  guard let provider = CGDataProvider(dataInfo: nil, data: base, size: bytes, releaseData: { _, _, _ in }) else { return nil }
  return CGImage(width: CVPixelBufferGetWidth(buffer), height: CVPixelBufferGetHeight(buffer), bitsPerComponent: 8,
                 bitsPerPixel: 32, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: sRGB,
                 bitmapInfo: CGBitmapInfo(rawValue: bgra), provider: provider, decode: nil,
                 shouldInterpolate: true, intent: .defaultIntent)
}

func pixel(of buffer: CVPixelBuffer, x: Int, y: Int) -> CGColor {
  let base = CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to: UInt8.self)
  let offset = y * CVPixelBufferGetBytesPerRow(buffer) + x * 4
  return CGColor(srgbRed: CGFloat(base[offset + 2]) / 255, green: CGFloat(base[offset + 1]) / 255,
                 blue: CGFloat(base[offset]) / 255, alpha: 1)
}

func text(_ string: String, size: CGFloat, weight: NSFont.Weight, color: NSColor) -> NSAttributedString {
  NSAttributedString(string: string, attributes: [
    .font: NSFont.systemFont(ofSize: size, weight: weight),
    .foregroundColor: color,
    .kern: size > 40 ? -1.0 : -0.2,
  ])
}

// MARK: - the frame

let canvas = CGSize(width: 1920, height: 1080)
let stage = CGRect(x: 96, y: 54, width: 1728, height: 972)
// The window's own corner, in points: macOS rounds a window's content, and the capture's alpha
// carries it at rest. A camera pushed in clips to this at the stage's edge instead.
let windowRadius: CGFloat = 13

final class Composer {
  let timeline: Timeline
  let clock: Clock
  let frames: Frames
  let windowSize: CGSize
  let backdrop: CGImage
  let cursorImage: NSImage
  let cursorHotSpot: NSPoint
  let icon: NSImage?
  let cursorOut: [(t: Double, key: Timeline.CursorKey)]
  let cameraOut: [(t: Double, key: Timeline.CameraKey)]

  init(timeline: Timeline, frames: Frames) {
    let clock = Clock(timeline.segments)
    self.timeline = timeline
    self.frames = frames
    self.clock = clock
    windowSize = CGSize(width: timeline.window[0], height: timeline.window[1])
    backdrop = Composer.makeBackdrop()
    cursorImage = NSCursor.arrow.image
    cursorHotSpot = NSCursor.arrow.hotSpot
    icon = timeline.outro?.icon.flatMap { NSImage(contentsOfFile: $0) }
    cursorOut = timeline.cursor.map { (clock.output($0.t), $0) }
    cameraOut = timeline.camera.map { (clock.output($0.t), $0) }
  }

  var duration: Double { clock.total + (timeline.outro?.duration ?? 0) }

  // Four of the demo projects' own hues, faint, on near black: the backdrop says "a colour per
  // project" before the window does.
  static func makeBackdrop() -> CGImage {
    let context = CGContext(data: nil, width: Int(canvas.width), height: Int(canvas.height), bitsPerComponent: 8,
                            bytesPerRow: 0, space: sRGB, bitmapInfo: bgra)!
    context.setFillColor(color(0x0e0f12))
    context.fill(CGRect(origin: .zero, size: canvas))
    let glows: [(CGPoint, UInt32)] = [
      (CGPoint(x: 0, y: 1080), 0xf97316), (CGPoint(x: 1920, y: 1080), 0x22c55e),
      (CGPoint(x: 0, y: 0), 0x0ea5e9), (CGPoint(x: 1920, y: 0), 0x8b5cf6),
    ]
    for (center, hue) in glows {
      let gradient = CGGradient(colorsSpace: sRGB, colors: [color(hue, 0.20), color(hue, 0)] as CFArray, locations: [0, 1])!
      context.drawRadialGradient(gradient, startCenter: center, startRadius: 0, endCenter: center, endRadius: 1100, options: [])
    }
    return context.makeImage()!
  }

  // MARK: camera

  // The window region on screen, in points, 16:9 like the stage. Each key eases in over the
  // `ease` seconds of output time that end at its own time.
  func camera(at output: Double) -> CGRect {
    var rect = CGRect(origin: .zero, size: windowSize)
    for (time, key) in cameraOut {
      let target = CGRect(x: key.x, y: key.y, width: key.w, height: key.w * 9 / 16)
      let ease = key.ease ?? 0.8
      if output >= time { rect = target; continue }
      if output > time - ease {
        let t = smooth((output - (time - ease)) / ease)
        // Width eases on a log scale, so a push-in reads as one steady speed.
        let width = exp(mix(log(Double(rect.width)), log(Double(target.width)), t))
        let cx = mix(Double(rect.midX), Double(target.midX), t)
        let cy = mix(Double(rect.midY), Double(target.midY), t)
        rect = CGRect(x: cx - width / 2, y: cy - width * 9 / 32, width: width, height: width * 9 / 16)
      }
      break
    }
    return rect
  }

  // MARK: cursor

  struct CursorState { var point: CGPoint; var alpha: Double; var press: Double; var ripple: Double? }

  func cursor(at output: Double) -> CursorState? {
    guard let first = cursorOut.first, output >= first.t - 0.4 else { return nil }
    var state = CursorState(point: CGPoint(x: first.key.x, y: first.key.y), alpha: smooth((output - (first.t - 0.4)) / 0.4), press: 0, ripple: nil)
    for (index, (time, key)) in cursorOut.enumerated() {
      let point = CGPoint(x: key.x, y: key.y)
      if index > 0 {
        let previous = cursorOut[index - 1]
        let travel = min(0.7, max(0.25, time - previous.t - 0.15))
        if output < time {
          if output > time - travel {
            let t = smooth((output - (time - travel)) / travel)
            state.point = CGPoint(x: mix(previous.key.x, key.x, t), y: mix(previous.key.y, key.y, t))
          }
          if key.hide == true { state.alpha *= 1 - smooth((output - (time - 0.3)) / 0.3) }
          break
        }
      }
      state.point = point
      if key.hide == true { state.alpha = 0 }
      else if index > 0, cursorOut[index - 1].key.hide == true { state.alpha = smooth((output - time) / 0.3) }
      if key.click == true {
        let since = output - time
        state.press = since < 0.16 ? 1 - since / 0.16 : 0
        state.ripple = since < 0.45 ? since / 0.45 : nil
      } else {
        state.press = 0
        state.ripple = nil
      }
    }
    return state
  }

  // MARK: render

  func render(into context: CGContext, output: Double) {
    context.saveGState()
    defer { context.restoreGState() }
    drawImage(context, backdrop, in: CGRect(origin: .zero, size: canvas))

    let outroStart = clock.total
    let appFade = timeline.outro == nil ? 1 : 1 - smooth((output - outroStart) / 0.6)
    if appFade > 0 {
      context.setAlpha(CGFloat(appFade))
      context.beginTransparencyLayer(auxiliaryInfo: nil)
      drawApp(context, output: min(output, outroStart - 0.001))
      context.endTransparencyLayer()
      context.setAlpha(1)
    }
    if let outro = timeline.outro, output > outroStart { drawCard(context, outro, alpha: smooth((output - outroStart - 0.3) / 0.6)) }
  }

  func drawApp(_ context: CGContext, output: Double) {
    let source = clock.source(output)
    let view = camera(at: output)
    let scale = stage.width / view.width
    let windowRect = CGRect(x: stage.minX - view.minX * scale, y: stage.minY - view.minY * scale,
                            width: windowSize.width * scale, height: windowSize.height * scale)
    let zoomed = view.width < windowSize.width - 1

    // The window's shadow, which only makes sense while the whole window is in frame.
    let rest = max(0, min(1, Double((view.width - windowSize.width * 0.9) / (windowSize.width * 0.1))))
    if rest > 0 {
      context.saveGState()
      context.setShadow(offset: CGSize(width: 0, height: 22), blur: 60, color: color(0x000000, 0.55 * rest))
      context.setFillColor(color(0x191a1b))
      context.addPath(CGPath(roundedRect: stage, cornerWidth: windowRadius * scale, cornerHeight: windowRadius * scale, transform: nil))
      context.fillPath()
      context.restoreGState()
    }

    guard let buffer = frames.frame(at: source) else { return }
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    let pointToPixel = CGFloat(CVPixelBufferGetWidth(buffer)) / windowSize.width

    context.saveGState()
    let clip = zoomed ? stage : windowRect
    context.addPath(CGPath(roundedRect: clip, cornerWidth: windowRadius * (zoomed ? 1.4 : scale), cornerHeight: windowRadius * (zoomed ? 1.4 : scale), transform: nil))
    context.clip()
    context.interpolationQuality = .high
    if let frame = image(of: buffer) { drawImage(context, frame, in: windowRect) }

    // macOS badges a window that is being captured with a purple pill where its traffic lights go.
    // That is the recorder's footprint, not the app's: the strip's own colour over it, and the
    // lights the window wears when you are the one using it.
    context.translateBy(x: windowRect.minX, y: windowRect.minY)
    context.scaleBy(x: scale, y: scale)
    context.setFillColor(pixel(of: buffer, x: Int(86 * pointToPixel), y: Int(18 * pointToPixel)))
    context.fill(CGRect(x: 0, y: 0, width: 80, height: 35))
    for (index, (fill, rim)) in [(0xff5f57, 0xe0443e), (0xfebc2e, 0xdea123), (0x28c840, 0x1aab29)].enumerated() {
      let dot = CGRect(x: 13 + Double(index) * 20, y: 12, width: 12, height: 12)
      context.setFillColor(color(UInt32(fill)))
      context.fillEllipse(in: dot)
      context.setStrokeColor(color(UInt32(rim), 0.8))
      context.setLineWidth(0.5)
      context.strokeEllipse(in: dot.insetBy(dx: 0.25, dy: 0.25))
    }
    context.restoreGState()

    if let state = cursor(at: output) {
      let at = CGPoint(x: windowRect.minX + state.point.x * scale, y: windowRect.minY + state.point.y * scale)
      drawCursor(context, at: at, state: state, zoom: Double(windowSize.width / view.width))
    }
    for item in timeline.texts {
      let start = clock.output(item.at), end = clock.output(item.until)
      guard output > start - 0.01, output < end + 0.35 else { continue }
      let alpha = smooth((output - start) / 0.35) * (1 - smooth((output - end) / 0.35))
      if item.style == "title" { drawTitle(context, item, alpha: alpha) }
      else if item.style == "keys" { drawKeys(context, item.text, alpha: alpha, rise: 1 - smooth((output - start) / 0.3)) }
      else if item.style == "label", let x = item.x, let y = item.y {
        drawLabel(context, item.text, at: CGPoint(x: windowRect.minX + x * scale, y: windowRect.minY + y * scale), alpha: alpha)
      }
      else { drawCaption(context, item.text, alpha: alpha, rise: 1 - smooth((output - start) / 0.4)) }
    }
  }

  // A shortcut, as the keys you would press, above the caption line: "⌃ ⌘ 2" is three keycaps.
  func drawKeys(_ context: CGContext, _ string: String, alpha: Double, rise: Double) {
    guard alpha > 0.01 else { return }
    let labels = string.split(separator: " ").map { text(String($0), size: 32, weight: .semibold, color: NSColor(white: 0.12, alpha: 1)) }
    let widths = labels.map { max(68, $0.size().width + 36) }
    let gap: CGFloat = 12
    let total = widths.reduce(0, +) + gap * CGFloat(labels.count - 1)
    var x = canvas.width / 2 - total / 2
    let y = stage.maxY - 196 + CGFloat(rise) * 12
    context.saveGState()
    context.setAlpha(CGFloat(alpha))
    for (label, width) in zip(labels, widths) {
      let key = CGRect(x: x, y: y, width: width, height: 68)
      context.setShadow(offset: CGSize(width: 0, height: 8), blur: 22, color: color(0x000000, 0.5))
      context.setFillColor(color(0xb9bac1))
      context.addPath(CGPath(roundedRect: key, cornerWidth: 14, cornerHeight: 14, transform: nil))
      context.fillPath()
      context.setShadow(offset: .zero, blur: 0, color: nil)
      context.setFillColor(color(0xf4f4f6))
      context.addPath(CGPath(roundedRect: key.insetBy(dx: 1.5, dy: 1.5).offsetBy(dx: 0, dy: -2.5), cornerWidth: 12, cornerHeight: 12, transform: nil))
      context.fillPath()
      NSGraphicsContext.saveGraphicsState()
      NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: true)
      let size = label.size()
      label.draw(at: CGPoint(x: key.midX - size.width / 2, y: key.midY - size.height / 2 - 2))
      NSGraphicsContext.restoreGraphicsState()
      x += width + gap
    }
    context.restoreGState()
  }

  // A callout beside the thing it names, left edge on the anchor, centred on it vertically.
  func drawLabel(_ context: CGContext, _ string: String, at point: CGPoint, alpha: Double) {
    guard alpha > 0.01 else { return }
    let label = text(string, size: 24, weight: .semibold, color: .white)
    let size = label.size()
    let pill = CGRect(x: point.x + 10, y: point.y - size.height / 2 - 9, width: size.width + 32, height: size.height + 18)
    context.saveGState()
    context.setAlpha(CGFloat(alpha))
    context.setShadow(offset: CGSize(width: 0, height: 6), blur: 18, color: color(0x000000, 0.55))
    context.setFillColor(color(0x141518, 0.94))
    context.addPath(CGPath(roundedRect: pill, cornerWidth: pill.height / 2, cornerHeight: pill.height / 2, transform: nil))
    context.fillPath()
    context.setShadow(offset: .zero, blur: 0, color: nil)
    context.setStrokeColor(color(0xffffff, 0.16))
    context.setLineWidth(1)
    context.addPath(CGPath(roundedRect: pill.insetBy(dx: 0.5, dy: 0.5), cornerWidth: pill.height / 2, cornerHeight: pill.height / 2, transform: nil))
    context.strokePath()
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: true)
    label.draw(at: CGPoint(x: pill.minX + 16, y: pill.minY + 9))
    NSGraphicsContext.restoreGraphicsState()
    context.restoreGState()
  }

  func drawCursor(_ context: CGContext, at point: CGPoint, state: CursorState, zoom: Double) {
    guard state.alpha > 0.01 else { return }
    let size = 2.1 * pow(zoom, 0.4) * (1 - 0.12 * state.press)
    if let ripple = state.ripple {
      let radius = CGFloat(10 + 26 * ripple) * CGFloat(sqrt(zoom))
      context.setStrokeColor(color(0xffffff, 0.75 * (1 - ripple) * state.alpha))
      context.setLineWidth(3)
      context.strokeEllipse(in: CGRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2))
    }
    let imageSize = cursorImage.size
    let rect = CGRect(x: point.x - cursorHotSpot.x * size, y: point.y - cursorHotSpot.y * size,
                      width: imageSize.width * size, height: imageSize.height * size)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: true)
    context.setShadow(offset: CGSize(width: 0, height: 3), blur: 8, color: color(0x000000, 0.35 * state.alpha))
    cursorImage.draw(in: rect, from: .zero, operation: .sourceOver, fraction: CGFloat(state.alpha), respectFlipped: true, hints: nil)
    NSGraphicsContext.restoreGraphicsState()
  }

  func drawCaption(_ context: CGContext, _ string: String, alpha: Double, rise: Double) {
    guard alpha > 0.01 else { return }
    let label = text(string, size: 30, weight: .semibold, color: .white)
    let size = label.size()
    let pill = CGRect(x: canvas.width / 2 - size.width / 2 - 26, y: stage.maxY - 96 + rise * 10,
                      width: size.width + 52, height: size.height + 26)
    context.saveGState()
    context.setAlpha(CGFloat(alpha))
    context.setShadow(offset: CGSize(width: 0, height: 10), blur: 30, color: color(0x000000, 0.5))
    context.setFillColor(color(0x141518, 0.88))
    context.addPath(CGPath(roundedRect: pill, cornerWidth: pill.height / 2, cornerHeight: pill.height / 2, transform: nil))
    context.fillPath()
    context.setShadow(offset: .zero, blur: 0, color: nil)
    context.setStrokeColor(color(0xffffff, 0.10))
    context.setLineWidth(1)
    context.addPath(CGPath(roundedRect: pill.insetBy(dx: 0.5, dy: 0.5), cornerWidth: pill.height / 2, cornerHeight: pill.height / 2, transform: nil))
    context.strokePath()
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: true)
    label.draw(at: CGPoint(x: pill.minX + 26, y: pill.minY + 13))
    NSGraphicsContext.restoreGraphicsState()
    context.restoreGState()
  }

  func drawTitle(_ context: CGContext, _ item: Timeline.Text, alpha: Double) {
    guard alpha > 0.01 else { return }
    context.saveGState()
    context.setAlpha(CGFloat(alpha))
    // The stage dims under a title, which otherwise lands on four busy editors.
    context.setFillColor(color(0x08090b, 0.62))
    context.addPath(CGPath(roundedRect: stage, cornerWidth: 16, cornerHeight: 16, transform: nil))
    context.fillPath()
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: true)
    let title = text(item.text, size: 76, weight: .bold, color: .white)
    let titleSize = title.size()
    title.draw(at: CGPoint(x: canvas.width / 2 - titleSize.width / 2, y: 250))
    if let sub = item.sub {
      let line = text(sub, size: 30, weight: .regular, color: NSColor(white: 0.72, alpha: 1))
      let lineSize = line.size()
      line.draw(at: CGPoint(x: canvas.width / 2 - lineSize.width / 2, y: 250 + titleSize.height + 8))
    }
    NSGraphicsContext.restoreGraphicsState()
    context.restoreGState()
  }

  func drawCard(_ context: CGContext, _ card: Timeline.Card, alpha: Double) {
    guard alpha > 0.01 else { return }
    context.saveGState()
    context.setAlpha(CGFloat(alpha))
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: true)
    var y: CGFloat = 330
    if let icon {
      icon.draw(in: CGRect(x: canvas.width / 2 - 110, y: y, width: 220, height: 220), from: .zero,
                operation: .sourceOver, fraction: 1, respectFlipped: true, hints: nil)
      y += 250
    }
    let title = text(card.title, size: 72, weight: .bold, color: .white)
    let titleSize = title.size()
    title.draw(at: CGPoint(x: canvas.width / 2 - titleSize.width / 2, y: y))
    let sub = text(card.subtitle, size: 30, weight: .regular, color: NSColor(white: 0.72, alpha: 1))
    let subSize = sub.size()
    sub.draw(at: CGPoint(x: canvas.width / 2 - subSize.width / 2, y: y + titleSize.height + 10))
    NSGraphicsContext.restoreGraphicsState()
    context.restoreGState()
  }
}

// MARK: - main

func withContext(_ buffer: CVPixelBuffer, _ body: (CGContext) -> Void) {
  CVPixelBufferLockBaseAddress(buffer, [])
  defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
  let context = CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: Int(canvas.width), height: Int(canvas.height),
                          bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: sRGB, bitmapInfo: bgra)!
  context.translateBy(x: 0, y: canvas.height)
  context.scaleBy(x: 1, y: -1)
  body(context)
}

func makeBuffer() -> CVPixelBuffer {
  var buffer: CVPixelBuffer?
  CVPixelBufferCreate(nil, Int(canvas.width), Int(canvas.height), kCVPixelFormatType_32BGRA,
                      [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &buffer)
  return buffer!
}

let args = Array(CommandLine.arguments.dropFirst())
guard let path = args.first else { fail("compose <timeline.json> [--stills <dir> t…]") }
let base = URL(fileURLWithPath: path).deletingLastPathComponent()
let timeline: Timeline
do { timeline = try JSONDecoder().decode(Timeline.self, from: Data(contentsOf: URL(fileURLWithPath: path))) }
catch { fail("timeline: \(error)") }
func resolve(_ file: String) -> URL { URL(fileURLWithPath: file, relativeTo: base).standardizedFileURL }

_ = NSApplication.shared
NSApp.setActivationPolicy(.prohibited)

let semaphore = DispatchSemaphore(value: 0)
Task {
  do {
    let frames = try await Frames(url: resolve(timeline.source))
    let composer = Composer(timeline: timeline, frames: frames)
    let fps = timeline.fps ?? 60

    if args.count >= 3, args[1] == "--stills" {
      let dir = URL(fileURLWithPath: args[2])
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      for (index, value) in args.dropFirst(3).compactMap(Double.init).sorted().enumerated() {
        let buffer = makeBuffer()
        withContext(buffer) { composer.render(into: $0, output: value) }
        let file = dir.appendingPathComponent(String(format: "still-%02d-%06.2f.png", index, value))
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        let rep = NSBitmapImageRep(cgImage: image(of: buffer)!)
        try rep.representation(using: .png, properties: [:])!.write(to: file)
        CVPixelBufferUnlockBaseAddress(buffer, .readOnly)
        print(file.path)
      }
      semaphore.signal()
      return
    }

    let out = resolve(timeline.output)
    try? FileManager.default.removeItem(at: out)
    try FileManager.default.createDirectory(at: out.deletingLastPathComponent(), withIntermediateDirectories: true)
    let writer = try AVAssetWriter(outputURL: out, fileType: .mp4)
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: Int(canvas.width),
      AVVideoHeightKey: Int(canvas.height),
      AVVideoColorPropertiesKey: [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
      ],
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 18_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoExpectedSourceFrameRateKey: fps,
      ],
    ])
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferWidthKey as String: Int(canvas.width),
      kCVPixelBufferHeightKey as String: Int(canvas.height),
    ])
    writer.add(input)
    guard writer.startWriting() else { fail("writer: \(writer.error?.localizedDescription ?? "unknown")") }
    writer.startSession(atSourceTime: .zero)

    let count = Int((composer.duration * Double(fps)).rounded())
    for index in 0..<count {
      while !input.isReadyForMoreMediaData { usleep(2000) }
      var pooled: CVPixelBuffer?
      CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pooled)
      let buffer = pooled ?? makeBuffer()
      withContext(buffer) { composer.render(into: $0, output: Double(index) / Double(fps)) }
      adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(index), timescale: CMTimeScale(fps)))
      if index % (fps * 5) == 0 { print("frame \(index)/\(count)") }
    }
    input.markAsFinished()
    await writer.finishWriting()
    if writer.status != .completed { fail("writer: \(writer.error?.localizedDescription ?? "unknown")") }
    print("wrote \(out.path) (\(String(format: "%.1f", composer.duration)) s)")
    semaphore.signal()
  } catch {
    fail("\(error)")
  }
}
semaphore.wait()
