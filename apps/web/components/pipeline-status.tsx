interface PipelineStatusProps {
  status: "idle" | "creating" | "planning" | "rendering" | "done" | "error";
}

const steps = [
  { key: "creating", label: "Create Mix" },
  { key: "planning", label: "Plan Transition" },
  { key: "rendering", label: "Render Audio" },
  { key: "done", label: "Complete" },
];

export function PipelineStatus({ status }: PipelineStatusProps) {
  if (status === "idle") return null;

  const currentIndex = steps.findIndex((s) => s.key === status);

  return (
    <div className="flex items-center gap-2 py-4">
      {steps.map((step, i) => {
        const isComplete = i < currentIndex || status === "done";
        const isCurrent = i === currentIndex && status !== "done";

        return (
          <div key={step.key} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`w-8 h-px ${isComplete ? "bg-green-500" : "bg-gray-300"}`}
              />
            )}

            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-3 h-3 rounded-full ${
                  isComplete
                    ? "bg-green-500"
                    : isCurrent
                    ? "bg-blue-500 animate-pulse"
                    : "bg-gray-300"
                }`}
              />
              <span className="text-xs text-gray-500">{step.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}