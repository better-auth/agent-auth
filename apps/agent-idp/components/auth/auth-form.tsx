"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, useSession } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

type AuthErrorContext = { error?: { message?: string } };

export function AuthForm() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { data: session } = useSession();
	const callbackUrl = (() => {
		const raw =
			searchParams.get("callbackURL") || searchParams.get("callbackUrl");
		if (raw && raw.startsWith("/")) return raw;
		return "/";
	})();
	const redirectToCallback = useCallback(
		(url: string) => {
			router.replace(url.startsWith("/") ? url : "/");
		},
		[router],
	);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [passwordConfirmation, setPasswordConfirmation] = useState("");
	const [loading, setLoading] = useState(false);
	const [name, setName] = useState("");
	const [username, setUsername] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [showPasswordConfirmation, setShowPasswordConfirmation] =
		useState(false);
	const [socialLoading, setSocialLoading] = useState<
		"google" | "github" | null
	>(null);
	const tabs = [
		{
			value: "sign-in",
			title: "Sign In",
			description: "Enter your credentials to access your account",
		},
		{
			value: "sign-up",
			title: "Sign Up",
			description: "Create an account to get started",
		},
	];
	const [active, setActive] = useState(tabs[0]);
	useEffect(() => {
		if (searchParams.get("signup") === "true") setActive(tabs[1]);
	}, [searchParams]);
	if (session?.user) return null;
	return (
		<div className="w-full max-w-md z-10 max-md:px-4 py-14">
			<div
				className={cn(
					"no-scrollbar relative mt-0 flex w-full max-w-max flex-row items-center justify-start overflow-auto perspective-[1000px] sm:overflow-visible",
				)}
			>
				{tabs.map((tab) => {
					const isActive = active?.value === tab.value;
					return (
						<button
							key={tab.value}
							className="relative px-4 py-2 hover:opacity-100"
							onClick={() => setActive(tab)}
							style={{ transformStyle: "preserve-3d" }}
							type="button"
						>
							<div
								className={cn(
									"absolute inset-0 border transition-colors",
									isActive
										? "bg-gray-200 dark:bg-zinc-950/90 border-border/60"
										: "border-border/30",
								)}
							/>
							<span
								className={cn(
									"relative block text-foreground",
									isActive ? "font-medium opacity-100" : "opacity-40",
								)}
							>
								{tab.title}
							</span>
						</button>
					);
				})}
			</div>
			<Card className="max-w-md rounded-none bg-background border-border/60">
				<CardHeader>
					<CardTitle className="text-lg md:text-xl">{active?.title}</CardTitle>
					<CardDescription className="text-xs md:text-sm">
						{active?.description}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{active?.value === "sign-in" ? (
						<form
							className="grid gap-4"
							onSubmit={async (e) => {
								e.preventDefault();
								setLoading(true);
								await authClient.signIn.email(
									{ email, password, callbackURL: callbackUrl },
									{
										onError(context: unknown) {
											toast.error(
												(context as AuthErrorContext)?.error?.message ||
													"Failed to sign in",
											);
										},
										onSuccess() {
											redirectToCallback(callbackUrl);
										},
									},
								);
								setLoading(false);
							}}
						>
							<div className="grid gap-2">
								<Label htmlFor="email">Email</Label>
								<Input
									id="email"
									onChange={(e) => setEmail(e.target.value)}
									placeholder="m@example.com"
									required
									type="email"
									value={email}
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="password">Password</Label>
								<div className="relative">
									<Input
										autoComplete="password"
										id="password"
										onChange={(e) => setPassword(e.target.value)}
										placeholder="Password"
										type={showPassword ? "text" : "password"}
										value={password}
										className="pr-10"
									/>
									<button
										type="button"
										className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
										onClick={() => setShowPassword(!showPassword)}
									>
										{showPassword ? (
											<EyeOff className="h-4 w-4" />
										) : (
											<Eye className="h-4 w-4" />
										)}
									</button>
								</div>
							</div>
							<Button className="w-full" disabled={loading} type="submit">
								{loading ? (
									<Loader2 className="animate-spin" size={16} />
								) : (
									"Sign in"
								)}
							</Button>
							<div className="flex w-full items-center gap-2 flex-col">
								<Button
									className={cn(
										"w-full gap-2 bg-transparent shadow-none transition-colors duration-200",
										"dark:bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/50",
									)}
									type="button"
									disabled={socialLoading !== null}
									onClick={async () => {
										setSocialLoading("google");
										await authClient.signIn.social({
											provider: "google",
											callbackURL: callbackUrl,
										});
									}}
									variant="outline"
								>
									{socialLoading === "google" ? (
										<Loader2 className="animate-spin" size={16} />
									) : (
										<svg
											height="1em"
											viewBox="0 0 256 262"
											width="0.98em"
											xmlns="http://www.w3.org/2000/svg"
										>
											<path
												d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622l38.755 30.023l2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"
												fill="#4285F4"
											/>
											<path
												d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055c-34.523 0-63.824-22.773-74.269-54.25l-1.531.13l-40.298 31.187l-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"
												fill="#34A853"
											/>
											<path
												d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82c0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602z"
												fill="#FBBC05"
											/>
											<path
												d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0C79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"
												fill="#EB4335"
											/>
										</svg>
									)}
									Sign in with Google
								</Button>
								<Button
									className={cn(
										"w-full gap-2 bg-transparent shadow-none transition-colors duration-200",
										"dark:bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/50",
									)}
									type="button"
									disabled={socialLoading !== null}
									onClick={async () => {
										setSocialLoading("github");
										await authClient.signIn.social({
											provider: "github",
											callbackURL: callbackUrl,
										});
									}}
									variant="outline"
								>
									{socialLoading === "github" ? (
										<Loader2 className="animate-spin" size={16} />
									) : (
										<svg
											height="1em"
											viewBox="0 0 24 24"
											width="1em"
											xmlns="http://www.w3.org/2000/svg"
										>
											<path
												d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2"
												fill="currentColor"
											/>
										</svg>
									)}
									Sign in with GitHub
								</Button>
							</div>
						</form>
					) : (
						<form
							className="grid gap-4"
							onSubmit={async (e) => {
								e.preventDefault();
								if (password !== passwordConfirmation) {
									toast.error("Passwords don't match");
									return;
								}
								setLoading(true);
								await authClient.signUp.email({
									email,
									password,
									name,
									callbackURL: callbackUrl,
									fetchOptions: {
										onResponse: () => setLoading(false),
										onRequest: () => setLoading(true),
										onError: (ctx: unknown) => {
											toast.error(
												(ctx as AuthErrorContext)?.error?.message ||
													"Failed to sign up",
											);
										},
										onSuccess: () => {
											router.refresh();
											redirectToCallback(callbackUrl);
										},
									},
								});
							}}
						>
							<div className="grid grid-cols-2 gap-4">
								<div className="grid gap-2">
									<Label htmlFor="name">Name</Label>
									<Input
										id="name"
										onChange={(e) => setName(e.target.value)}
										placeholder="John Doe"
										required
										value={name}
									/>
								</div>
								<div className="grid gap-2">
									<Label htmlFor="username">Username</Label>
									<Input
										id="username"
										onChange={(e) => setUsername(e.target.value)}
										placeholder="johndoe"
										required
										value={username}
										minLength={3}
									/>
								</div>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="signup-email">Email</Label>
								<Input
									id="signup-email"
									onChange={(e) => setEmail(e.target.value)}
									placeholder="m@example.com"
									required
									type="email"
									value={email}
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="signup-password">Password</Label>
								<div className="relative">
									<Input
										autoComplete="new-password"
										id="signup-password"
										onChange={(e) => setPassword(e.target.value)}
										placeholder="Password"
										type={showPassword ? "text" : "password"}
										value={password}
										className="pr-10"
										minLength={8}
									/>
									<button
										type="button"
										className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
										onClick={() => setShowPassword(!showPassword)}
									>
										{showPassword ? (
											<EyeOff className="h-4 w-4" />
										) : (
											<Eye className="h-4 w-4" />
										)}
									</button>
								</div>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="password_confirmation">Confirm Password</Label>
								<div className="relative">
									<Input
										autoComplete="new-password"
										id="password_confirmation"
										onChange={(e) => setPasswordConfirmation(e.target.value)}
										placeholder="Confirm Password"
										type={showPasswordConfirmation ? "text" : "password"}
										value={passwordConfirmation}
										className="pr-10"
										minLength={8}
									/>
									<button
										type="button"
										className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
										onClick={() =>
											setShowPasswordConfirmation(!showPasswordConfirmation)
										}
									>
										{showPasswordConfirmation ? (
											<EyeOff className="h-4 w-4" />
										) : (
											<Eye className="h-4 w-4" />
										)}
									</button>
								</div>
							</div>
							<Button className="w-full" disabled={loading} type="submit">
								{loading ? (
									<Loader2 className="animate-spin" size={16} />
								) : (
									"Create an account"
								)}
							</Button>
						</form>
					)}
				</CardContent>
				<CardFooter>
					<div className="flex w-full justify-center border-t pt-4">
						<p className="text-center text-muted-foreground text-xs">
							Powered by{" "}
							<a
								className="underline hover:text-foreground transition-colors"
								href="https://www.better-auth.com"
								target="_blank"
								rel="noopener noreferrer"
							>
								Better Auth
							</a>
						</p>
					</div>
				</CardFooter>
			</Card>
		</div>
	);
}
