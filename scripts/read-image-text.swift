// The text in the image on stdin, as JSON on stdout: one { text, x, y, width, height } per line, each
// a share of the image from its top left. Built by scripts/build-image-text.sh.
//
// `.accurate` because `.fast` misreads code: `/Users/jp` came back as `/Users/i p`. No language
// correction for the same reason, since it "fixes" identifiers into words.

import Foundation
import Vision

struct Line: Encodable {
    let text: String
    let x, y, width, height: Double
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
request.recognitionLanguages = ["en-US", "pt-BR"]

let image = FileHandle.standardInput.readDataToEndOfFile()
try VNImageRequestHandler(data: image).perform([request])

let lines = (request.results ?? []).compactMap { observation -> Line? in
    guard let text = observation.topCandidates(1).first?.string else { return nil }
    let box = observation.boundingBox
    return Line(text: text, x: box.minX, y: 1 - box.maxY, width: box.width, height: box.height)
}
print(String(decoding: try JSONEncoder().encode(lines), as: UTF8.self))
