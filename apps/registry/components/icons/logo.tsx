import type { SVGProps } from "react";

export const AgentAuthLogo = (props: SVGProps<SVGSVGElement>) => {
	return (
		<svg
			{...props}
			fill="none"
			viewBox="0 0 163 91"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				className="fill-black dark:fill-white"
				d="M61 90.88L93.768 0H108.616L139.94 90.88H129.44L120.264 65.024H82.12L73.032 90.88H61ZM85.832 54.272H116.552L101.192 9.6L85.832 54.272Z"
			/>
			<path
				className="fill-black dark:fill-white"
				d="M0 90.88L32.768 0H47.616L69.9399 63.8799L64.9399 76.8799L59.264 65.024H21.12L12.032 90.88H0ZM24.832 54.272H55.552L40.192 9.6L24.832 54.272Z"
			/>
			<rect
				className="fill-black dark:fill-white"
				height="15"
				width="15"
				x="147.44"
				y="75.8799"
			/>
		</svg>
	);
};
