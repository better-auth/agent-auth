import { ChatClient } from "./chat-client";

export default async function ChatPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;

	return (
		<div className="max-w-4xl mx-auto h-full">
			<ChatClient orgSlug={orgSlug} />
		</div>
	);
}
