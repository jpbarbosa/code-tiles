#!/bin/zsh
# A contact sheet of a rendered video: evenly spaced frames tiled three wide, for checking a cut
# without watching it. Prints the time of each cell, left to right, top to bottom.
# usage: review.sh <video.mp4> <out.png> [frames]
VIDEO=$1
OUT=$2
COUNT=${3:-15}
DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $VIDEO)
FRAMES=$(mktemp -d)
for i in $(seq 0 $((COUNT - 1))); do
  # printf, because bc drops the leading zero and ffmpeg refuses ".1" as a time.
  T=$(printf '%.2f' $(echo "scale=3; 0.1 + ($DURATION - 0.4) * $i / ($COUNT - 1)" | bc))
  ffmpeg -v error -y -ss $T -i $VIDEO -frames:v 1 -vf scale=640:360 $FRAMES/$(printf 'f%02d' $i).png
  printf '%s ' $T
done
echo
ffmpeg -v error -y -pattern_type glob -i "$FRAMES/f*.png" -vf "tile=3x$(( (COUNT + 2) / 3 )):padding=4:color=white" -frames:v 1 $OUT
rm -rf $FRAMES
echo $OUT
