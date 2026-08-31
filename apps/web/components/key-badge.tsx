interface KeyBadgeProps {
    camelot?: string | null;
    musicalKey?: string | null;
    confidence?: number | null;
    size?: "sm" | "md";
}

export function KeyBadge({ camelot, musicalKey, confidence, size = "sm" }: KeyBadgeProps) {
    if (!camelot) {
        return (
            <span className={`inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-400 ${size === "md" ? "text-sm" : ""}`}>
                No key
            </span>
        );
    }

    const isMinor = camelot.endsWith("A");
    const bgColor = isMinor ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700";

    return (
        <div className="flex items-center gap-1">
            <span className={`inline-flex items-center rounded px-2 py-0.5 font-mono font-bold ${bgColor} ${size === "md" ? "text-sm px-3 py-1" : "text-xs"}`}>
                {camelot}
            </span>
            {size === "md" && musicalKey && (
                <span className="text-xs text-gray-500">{musicalKey}</span>
            )}
            {confidence !== undefined && confidence !== null && confidence < 0.6 && (
                <span className="text-[10px] text-yellow-500" title={`Low confidence: ${(confidence * 100).toFixed(0)}%`}>
                    ⚠
                </span>
            )}
        </div>
    );
}