import { cn } from "@/lib/utils";

export function StatsCard({
	label,
	value,
	detail,
	className,
}: {
	label: string;
	value: string | number;
	detail?: string;
	className?: string;
}) {
	return (
		<div className={cn("p-4 flex flex-col gap-1", className)}>
			<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
				{label}
			</p>
			<p className="text-2xl font-semibold tracking-tight">{value}</p>
			{detail && <p className="text-xs text-muted-foreground">{detail}</p>}
		</div>
	);
}
