import React from "react";

export default function VideoGrid({
  peers,
  localStream,
  localName,
  localHighlight,
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
      {/* Local video */}
      <div
        className={`relative rounded-xl overflow-hidden border-4 ${
          localHighlight ? "border-pink-500" : "border-blue-300"
        }`}>
        <video
          className="w-full h-40 object-cover bg-black"
          ref={(video) => {
            if (video && localStream) {
              video.srcObject = localStream;
            }
          }}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={(e) => e.target.play()}
        />
        <div className="absolute bottom-1 left-1 bg-white bg-opacity-80 rounded px-2 text-xs font-bold text-blue-700">
          {localName} (You)
        </div>
      </div>
      {/* Remote videos */}
      {peers.map((peer, i) => (
        <div
          key={i}
          className={`relative rounded-xl overflow-hidden border-4 ${
            peer.isHighlighted ? "border-pink-500" : "border-blue-300"
          }`}>
          <video
            className="w-full h-40 object-cover bg-black"
            ref={(video) => {
              if (video && peer.stream) {
                video.srcObject = peer.stream;
              }
            }}
            autoPlay
            playsInline
            onLoadedMetadata={(e) => e.target.play()}
          />
          <div className="absolute bottom-1 left-1 bg-white bg-opacity-80 rounded px-2 text-xs font-bold text-blue-700">
            {peer.name}
          </div>
        </div>
      ))}
    </div>
  );
}
