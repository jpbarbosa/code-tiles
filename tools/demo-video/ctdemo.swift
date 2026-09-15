// A display nobody can see, and a recorder for one window on it: how the demo is filmed while
// the Mac is in use. Nothing here activates an app or moves the cursor.
//
//   ctdemo display <width> <height> [x y]   virtual HiDPI display in points; lives until SIGTERM
//   ctdemo record <pid> <out.mov> [fps]     the pid's largest window, HEVC with alpha, until SIGINT
//   ctdemo frontmost                        which app has the user's focus
import AppKit
import AVFoundation
import CoreGraphics
import ScreenCaptureKit
import VideoToolbox

setvbuf(stdout, nil, _IOLBF, 0)
// ScreenCaptureKit asserts on a process with no WindowServer connection. Prohibited: this tool
// never has a Dock icon, a menu bar or a chance to take focus.
NSApplication.shared.setActivationPolicy(.prohibited)

func fail(_ message: String) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(1)
}

func emit(_ object: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  print(String(data: data, encoding: .utf8)!)
}

var signalSources: [DispatchSourceSignal] = []
func onStop(_ handler: @escaping () -> Void) {
  for number in [SIGINT, SIGTERM] {
    signal(number, SIG_IGN)
    let source = DispatchSource.makeSignalSource(signal: number, queue: .main)
    source.setEventHandler(handler: handler)
    source.resume()
    signalSources.append(source)
  }
}

func describe(_ id: CGDirectDisplayID) -> [String: Any] {
  let bounds = CGDisplayBounds(id)
  let mode = CGDisplayCopyDisplayMode(id)
  return [
    "id": Int(id),
    "x": bounds.origin.x, "y": bounds.origin.y, "width": bounds.width, "height": bounds.height,
    "pixelWidth": mode?.pixelWidth ?? 0, "pixelHeight": mode?.pixelHeight ?? 0,
  ]
}

func activeDisplays() -> [CGDirectDisplayID] {
  var ids = [CGDirectDisplayID](repeating: 0, count: 32)
  var count: UInt32 = 0
  CGGetActiveDisplayList(32, &ids, &count)
  return Array(ids.prefix(Int(count)))
}

var display: CGVirtualDisplay?

func runDisplay(width: UInt32, height: UInt32, origin: CGPoint?) {
  let descriptor = CGVirtualDisplayDescriptor()
  descriptor.queue = DispatchQueue.main
  descriptor.name = "Code Tiles Demo"
  descriptor.maxPixelsWide = width * 2
  descriptor.maxPixelsHigh = height * 2
  descriptor.sizeInMillimeters = CGSize(width: 580, height: 580 * Double(height) / Double(width))
  descriptor.productID = 0x7c01
  descriptor.vendorID = 0x7c7c
  descriptor.serialNum = 1
  descriptor.whitePoint = CGPoint(x: 0.3125, y: 0.3291)
  descriptor.redPrimary = CGPoint(x: 0.6797, y: 0.3203)
  descriptor.greenPrimary = CGPoint(x: 0.2559, y: 0.6983)
  descriptor.bluePrimary = CGPoint(x: 0.1494, y: 0.0557)
  descriptor.terminationHandler = { _, _ in fail("virtual display terminated") }

  guard let created = CGVirtualDisplay(descriptor: descriptor) else { fail("no virtual display") }
  let settings = CGVirtualDisplaySettings()
  settings.hiDPI = 1
  settings.modes = [
    CGVirtualDisplayMode(width: width * 2, height: height * 2, refreshRate: 60),
    CGVirtualDisplayMode(width: width, height: height, refreshRate: 60),
  ]
  guard created.apply(settings) else { fail("the virtual display refused its settings") }
  display = created
  let id = created.displayID

  // The display joins the arrangement a moment after it is created, wherever macOS likes.
  DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
    if let origin {
      var config: CGDisplayConfigRef?
      CGBeginDisplayConfiguration(&config)
      CGConfigureDisplayOrigin(config, id, Int32(origin.x), Int32(origin.y))
      let error = CGCompleteDisplayConfiguration(config, .forAppOnly)
      if error != .success { FileHandle.standardError.write("origin not applied: \(error)\n".data(using: .utf8)!) }
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
      var answer = describe(id)
      answer["event"] = "display"
      answer["all"] = activeDisplays().map(describe)
      emit(answer)
    }
  }
  onStop { display = nil; exit(0) }
  dispatchMain()
}

final class Recorder: NSObject, SCStreamOutput, SCStreamDelegate {
  private let writer: AVAssetWriter
  private let input: AVAssetWriterInput
  private var started = false
  private var frames = 0
  private var firstWall = 0.0
  let queue = DispatchQueue(label: "ctdemo.record")

  init(url: URL, width: Int, height: Int, fps: Int) throws {
    try? FileManager.default.removeItem(at: url)
    writer = try AVAssetWriter(outputURL: url, fileType: .mov)
    input = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.hevcWithAlpha,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 90_000_000,
        AVVideoExpectedSourceFrameRateKey: fps,
        kVTCompressionPropertyKey_TargetQualityForAlpha as String: 0.9,
      ],
    ])
    input.expectsMediaDataInRealTime = true
    writer.add(input)
  }

  func stream(_ stream: SCStream, didOutputSampleBuffer buffer: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .screen, buffer.isValid else { return }
    // A frame with nothing new in it arrives as .idle and carries no image.
    guard let attachments = CMSampleBufferGetSampleAttachmentsArray(buffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
          let raw = attachments.first?[.status] as? Int,
          SCFrameStatus(rawValue: raw) == .complete else { return }
    let pts = buffer.presentationTimeStamp
    if !started {
      guard writer.startWriting() else { fail("writer: \(writer.error?.localizedDescription ?? "unknown")") }
      writer.startSession(atSourceTime: pts)
      started = true
      // Wall clock of the first frame, so the driver's timestamps land on the video's timeline.
      let hostNow = CMClockGetTime(CMClockGetHostTimeClock()).seconds
      firstWall = Date().timeIntervalSince1970 - (hostNow - pts.seconds)
      emit(["event": "first-frame", "wall": firstWall])
    }
    if input.isReadyForMoreMediaData {
      input.append(buffer)
      frames += 1
    }
  }

  func stream(_ stream: SCStream, didStopWithError error: Error) {
    fail("capture stopped: \(error.localizedDescription)")
  }

  func finish(_ done: @escaping ([String: Any]) -> Void) {
    queue.async {
      guard self.started else { return done(["event": "finished", "frames": 0]) }
      self.input.markAsFinished()
      self.writer.finishWriting {
        done(["event": "finished", "frames": self.frames, "firstWall": self.firstWall,
              "status": self.writer.status.rawValue, "error": self.writer.error?.localizedDescription ?? ""])
      }
    }
  }
}

var recorder: Recorder?
var stream: SCStream?

func runRecord(pid: pid_t, out: URL, fps: Int) {
  Task {
    let content: SCShareableContent
    do { content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true) }
    catch { fail("shareable content: \(error.localizedDescription)") }
    let windows = content.windows
      .filter { $0.owningApplication?.processID == pid && $0.windowLayer == 0 }
      .sorted { $0.frame.width * $0.frame.height > $1.frame.width * $1.frame.height }
    guard let window = windows.first else { fail("no on-screen window for pid \(pid)") }

    // The app's windows on that display, cropped to the main one: a single-window capture leaves
    // out a child window, and the app's picker is one, laid over the stage.
    guard let app = content.applications.first(where: { $0.processID == pid }),
          let display = content.displays.first(where: { $0.frame.contains(CGPoint(x: window.frame.midX, y: window.frame.midY)) })
    else { fail("no display under the window of pid \(pid)") }
    let filter = SCContentFilter(display: display, including: [app], exceptingWindows: [])
    let scale = CGFloat(filter.pointPixelScale)
    let region = window.frame.offsetBy(dx: -display.frame.minX, dy: -display.frame.minY)
    let width = Int(region.width * scale)
    let height = Int(region.height * scale)
    let config = SCStreamConfiguration()
    config.sourceRect = region
    // The shared constant: the configuration does not retain its colour, so a temporary one is
    // freed before SCStream copies it, and the copy crashes.
    config.backgroundColor = CGColor.clear
    config.width = width
    config.height = height
    config.pixelFormat = kCVPixelFormatType_32BGRA
    config.colorSpaceName = CGColorSpace.sRGB
    config.showsCursor = false
    config.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(fps))
    config.queueDepth = 8

    do {
      let made = try Recorder(url: out, width: width, height: height, fps: fps)
      let capture = SCStream(filter: filter, configuration: config, delegate: made)
      try capture.addStreamOutput(made, type: .screen, sampleHandlerQueue: made.queue)
      try await capture.startCapture()
      recorder = made
      stream = capture
      emit(["event": "recording", "window": window.title ?? "", "width": width, "height": height,
            "frame": [window.frame.origin.x, window.frame.origin.y, window.frame.width, window.frame.height]])
    } catch { fail("capture: \(error.localizedDescription)") }
  }

  onStop {
    guard let capture = stream, let made = recorder else { exit(1) }
    capture.stopCapture { _ in
      made.finish { summary in
        emit(summary)
        exit(0)
      }
    }
  }
  dispatchMain()
}

let args = Array(CommandLine.arguments.dropFirst())
switch args.first {
case "display":
  guard args.count >= 3, let width = UInt32(args[1]), let height = UInt32(args[2]) else { fail("display <width> <height> [x y]") }
  let origin = args.count >= 5 ? CGPoint(x: Double(args[3])!, y: Double(args[4])!) : nil
  runDisplay(width: width, height: height, origin: origin)
case "record":
  guard args.count >= 3, let pid = pid_t(args[1]) else { fail("record <pid> <out.mov> [fps]") }
  runRecord(pid: pid, out: URL(fileURLWithPath: args[2]), fps: args.count >= 4 ? Int(args[3])! : 60)
case "frontmost":
  print(NSWorkspace.shared.frontmostApplication?.localizedName ?? "none")
case "locked":
  // While locked, macOS reports no active displays and composites nothing, so nothing can be filmed.
  let session = CGSessionCopyCurrentDictionary() as? [String: Any]
  print((session?["CGSSessionScreenIsLocked"] as? Bool) == true ? 1 : 0)
case "place":
  // A display wake re-arranges displays and drops an app-only origin, so this one lasts the session.
  guard args.count >= 4, let id = CGDirectDisplayID(args[1]), let x = Int32(args[2]), let y = Int32(args[3]) else { fail("place <id> <x> <y>") }
  var config: CGDisplayConfigRef?
  CGBeginDisplayConfiguration(&config)
  CGConfigureDisplayOrigin(config, id, x, y)
  let error = CGCompleteDisplayConfiguration(config, .forSession)
  guard error == .success else { fail("place: \(error)") }
  emit(describe(id))
case "displays":
  for id in activeDisplays() { emit(describe(id)) }
default:
  fail("ctdemo display|record|frontmost|displays")
}
