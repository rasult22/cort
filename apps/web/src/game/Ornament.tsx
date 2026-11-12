/** The felt and its faint central medallion. Purely decorative. */
export function Ornament() {
    const petals = Array.from({ length: 8 }, (_, i) => i * 45);
    return (
        <div className="felt" aria-hidden="true">
            <svg className="felt-medallion" viewBox="-100 -100 200 200">
                <g fill="none" stroke="currentColor" strokeWidth="0.8">
                    <circle r="96" />
                    <circle r="90" strokeDasharray="1.5 3" />
                    <rect x="-62" y="-62" width="124" height="124" />
                    <rect x="-62" y="-62" width="124" height="124" transform="rotate(45)" />
                    <circle r="62" />
                    <circle r="36" />
                    {petals.map((angle) => (
                        <path key={angle} d="M0 -36 C 12 -52, 12 -70, 0 -87.500 C -12 -70, -12 -52, 0 -36 Z" transform={`rotate(${angle})`} />
                    ))}
                    <rect x="-18" y="-18" width="36" height="36" />
                    <rect x="-18" y="-18" width="36" height="36" transform="rotate(45)" />
                </g>
            </svg>
        </div>
    );
}
