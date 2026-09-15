// A screenshot of the made-up fern app, for the take to paste into a Claude chat and mark up.
// Drawn rather than captured: fern is a prop with no dependencies installed, so it never runs.
// usage: swift mock-card.swift <out.png>
import AppKit

let size = CGSize(width: 1200, height: 760)
let image = NSImage(size: size, flipped: true) { _ in
  let ink = NSColor(srgbRed: 0.10, green: 0.13, blue: 0.11, alpha: 1)
  let muted = NSColor(srgbRed: 0.42, green: 0.47, blue: 0.44, alpha: 1)
  let leaf = NSColor(srgbRed: 0.13, green: 0.77, blue: 0.37, alpha: 1)
  NSColor(srgbRed: 0.95, green: 0.97, blue: 0.95, alpha: 1).setFill()
  NSRect(origin: .zero, size: size).fill()

  func text(_ string: String, _ point: CGPoint, _ size: CGFloat, _ weight: NSFont.Weight, _ color: NSColor) {
    NSAttributedString(string: string, attributes: [.font: NSFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color]).draw(at: point)
  }
  func rounded(_ rect: NSRect, _ radius: CGFloat, fill: NSColor, stroke: NSColor? = nil) {
    let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
    fill.setFill()
    path.fill()
    if let stroke { stroke.setStroke(); path.lineWidth = 2; path.stroke() }
  }

  text("Fern", CGPoint(x: 60, y: 44), 44, .bold, ink)
  rounded(NSRect(x: 900, y: 52, width: 110, height: 44), 22, fill: ink)
  text("All", CGPoint(x: 940, y: 62), 20, .semibold, .white)
  rounded(NSRect(x: 1022, y: 52, width: 118, height: 44), 22, fill: .white, stroke: NSColor(white: 0.85, alpha: 1))
  text("Thirsty", CGPoint(x: 1046, y: 62), 20, .semibold, ink)

  let plants = [("Monty", "Monstera deliciosa", "2 days overdue", true), ("Goldie", "Epipremnum aureum", "In 3 days", false),
                ("Boston", "Nephrolepis exaltata", "Water today", true)]
  for (index, (name, species, when, due)) in plants.enumerated() {
    let card = NSRect(x: 60 + CGFloat(index) * 370, y: 150, width: 340, height: 540)
    let shadow = NSShadow()
    shadow.shadowColor = NSColor(white: 0, alpha: 0.10)
    shadow.shadowBlurRadius = 18
    shadow.shadowOffset = NSSize(width: 0, height: -6)
    NSGraphicsContext.saveGraphicsState()
    shadow.set()
    rounded(card, 22, fill: .white)
    NSGraphicsContext.restoreGraphicsState()
    if due { rounded(card, 22, fill: .clear, stroke: index == 0 ? NSColor.systemRed.withAlphaComponent(0.7) : leaf) }

    let photo = NSRect(x: card.minX + 20, y: card.minY + 20, width: card.width - 40, height: 250)
    rounded(photo, 14, fill: NSColor(srgbRed: 0.86, green: 0.93, blue: 0.87, alpha: 1))
    let blob = NSBezierPath(ovalIn: NSRect(x: photo.midX - 70, y: photo.midY - 80, width: 140, height: 160))
    leaf.withAlphaComponent(0.85).setFill()
    blob.fill()

    text(name, CGPoint(x: card.minX + 24, y: card.minY + 296), 30, .bold, ink)
    text(species, CGPoint(x: card.minX + 24, y: card.minY + 340), 20, .regular, muted)
    text(when, CGPoint(x: card.minX + 24, y: card.minY + 384), 20, .semibold, index == 0 ? .systemRed : (due ? leaf : muted))
    // The button the chat is about: small and grey, which is the complaint.
    rounded(NSRect(x: card.minX + 24, y: card.minY + 470, width: 84, height: 34), 8, fill: NSColor(white: 0.90, alpha: 1))
    text("Water", CGPoint(x: card.minX + 40, y: card.minY + 477), 16, .medium, muted)
  }
  return true
}

let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
try! bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
print(CommandLine.arguments[1])
