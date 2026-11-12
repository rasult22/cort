const turn = (count: number, offset = 0) => Array.from({ length: count }, (_, i) => offset + (i * 360) / count);

/**
 * The felt and its central medallion, drawn after motifs of Uyghur ornament:
 * the badam (almond), the pomegranate flower, the tulip bud and the
 * eight-pointed star, set in rings the way they are on a carved ceiling
 * rosette or an embroidered doppa. Purely decorative.
 */
export function Ornament() {
    return (
        <div className="felt" aria-hidden="true">
            <svg className="felt-medallion" viewBox="-100 -100 200 200">
                <g fill="none" stroke="currentColor" strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round">
                    {/* Outer border: two rings with a chain of beads and small leaves between them. */}
                    <circle r="98" />
                    <circle r="88.500" />
                    {turn(32).map((angle) => (
                        <path key={angle} d="M0 -96 C 2.600 -94.500, 2.600 -91.500, 0 -90.500 C -2.600 -91.500, -2.600 -94.500, 0 -96 Z" transform={`rotate(${angle})`} />
                    ))}
                    {turn(32, 5.625).map((angle) => (
                        <circle key={angle} cx="0" cy="-93.200" r="0.900" fill="currentColor" stroke="none" transform={`rotate(${angle})`} />
                    ))}

                    {/* Badam: the almond with its curled tip, eight of them chasing each other round the ring. */}
                    {turn(8).map((angle) => (
                        <g key={angle} transform={`rotate(${angle})`}>
                            <path
                                d="M-7 -56 C -16 -63, -13 -78, 1 -82 C 8 -84, 13.500 -80.500, 12.500 -76.500 C 6.500 -78.500, 1.500 -74, 1.500 -68 C 1.500 -62.500, -2 -57.500, -7 -56 Z"
                                fill="currentColor"
                                fillOpacity="0.140"
                            />
                            <path d="M-6.500 -61 C -10.500 -66, -8.500 -74.500, -1 -77.500" opacity="0.850" />
                            <circle cx="-3.500" cy="-68" r="1.500" fill="currentColor" stroke="none" />
                        </g>
                    ))}

                    {/* Tulip buds on curling stems between the almonds. */}
                    {turn(8, 22.500).map((angle) => (
                        <g key={angle} transform={`rotate(${angle})`}>
                            <path d="M0 -52 C -3 -58, 3 -62, 0 -67" />
                            <path d="M0 -67 C -5 -69, -5.500 -76, -3.500 -79.500 C -2 -76, -1 -74, 0 -73 C 1 -74, 2 -76, 3.500 -79.500 C 5.500 -76, 5 -69, 0 -67 Z" fill="currentColor" fillOpacity="0.25" />
                            <path d="M0 -73 L 0 -81.500" />
                            <path d="M0 -57 C -5 -57, -7.500 -60, -8 -63.500 M0 -57 C 5 -57, 7.500 -60, 8 -63.500" />
                        </g>
                    ))}

                    {/* Inner band. */}
                    <circle r="50" />
                    <circle r="47" strokeDasharray="0.200 2.600" strokeWidth="1.200" />

                    {/* Eight-pointed star: two squares, one turned, with the octagon they enclose. */}
                    <rect x="-31" y="-31" width="62" height="62" />
                    <rect x="-31" y="-31" width="62" height="62" transform="rotate(45)" />
                    <path d="M0 -43.800 L 12.800 -31 L 31 -31 L 31 -12.800 L 43.800 0 L 31 12.800 L 31 31 L 12.800 31 L 0 43.800 L -12.800 31 L -31 31 L -31 12.800 L -43.800 0 L -31 -12.800 L -31 -31 L -12.800 -31 Z" strokeWidth="1" />
                    {turn(8, 22.500).map((angle) => (
                        <circle key={angle} cx="0" cy="-36" r="1.200" fill="currentColor" stroke="none" transform={`rotate(${angle})`} />
                    ))}

                    {/* Pomegranate flower at the heart: two rows of pointed petals round a seeded centre. */}
                    {turn(8).map((angle) => (
                        <path key={angle} d="M0 -9 C 6.500 -13, 7 -21, 0 -27.500 C -7 -21, -6.500 -13, 0 -9 Z" fill="currentColor" fillOpacity="0.180" transform={`rotate(${angle})`} />
                    ))}
                    {turn(8, 22.500).map((angle) => (
                        <path key={angle} d="M0 -10 C 3.500 -13, 4 -17, 0 -21 C -4 -17, -3.500 -13, 0 -10 Z" transform={`rotate(${angle})`} />
                    ))}
                    <circle r="8.500" fill="currentColor" fillOpacity="0.220" />
                    {turn(6).map((angle) => (
                        <circle key={angle} cx="0" cy="-4.200" r="1.100" fill="currentColor" stroke="none" transform={`rotate(${angle})`} />
                    ))}
                    <circle r="1.300" fill="currentColor" stroke="none" />
                </g>
            </svg>
        </div>
    );
}
