import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
	title: "AgentDeploy",
	description: "AI-powered deployment platform with Agent Auth",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html
			lang="en"
			className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
			suppressHydrationWarning
		>
			<body className="min-h-screen font-sans antialiased">
				{children}
				<Toaster theme="dark" richColors position="bottom-right" />
			</body>
		</html>
	);
}
