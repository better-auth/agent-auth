import { db } from "./index";
import { site, deployment } from "./schema";

function id() {
	return crypto.randomUUID();
}

function ago(minutes: number) {
	return new Date(Date.now() - minutes * 60_000).toISOString();
}

const SITES = [
	{
		name: "My Portfolio",
		slug: "my-portfolio",
		html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>My Portfolio</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#fafafa;min-height:100vh;display:flex;align-items:center;justify-content:center}.card{max-width:480px;padding:3rem;text-align:center}h1{font-size:2.5rem;font-weight:700;background:linear-gradient(135deg,#60a5fa,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}p{margin-top:1rem;color:#a1a1aa;line-height:1.7}</style>
</head>
<body><div class="card"><h1>Jane Developer</h1><p>Full-stack engineer building things for the web. I love TypeScript, React, and making fast user experiences.</p></div></body>
</html>`,
		deployCount: 3,
	},
	{
		name: "Status Page",
		slug: "status-page",
		html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Status Page</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#fafafa;color:#18181b;padding:2rem}.container{max-width:600px;margin:0 auto}h1{font-size:1.5rem;font-weight:600}ul{list-style:none;margin-top:1.5rem;display:flex;flex-direction:column;gap:.75rem}li{display:flex;align-items:center;justify-content:space-between;padding:1rem;background:#fff;border:1px solid #e4e4e7;border-radius:.5rem}.dot{width:10px;height:10px;border-radius:50%;background:#22c55e}</style>
</head>
<body><div class="container"><h1>System Status</h1><ul><li><span>API</span><span class="dot"></span></li><li><span>Database</span><span class="dot"></span></li><li><span>CDN</span><span class="dot"></span></li></ul></div></body>
</html>`,
		deployCount: 5,
	},
	{
		name: "Landing Page",
		slug: "landing-page",
		html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Acme Inc</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#fff;color:#18181b}header{padding:4rem 2rem;text-align:center;background:linear-gradient(135deg,#eff6ff,#f5f3ff)}h1{font-size:3rem;font-weight:800;letter-spacing:-.02em}p{margin-top:1rem;font-size:1.125rem;color:#71717a;max-width:480px;margin-inline:auto}.btn{display:inline-block;margin-top:2rem;padding:.75rem 2rem;background:#18181b;color:#fff;border-radius:.5rem;text-decoration:none;font-weight:500}</style>
</head>
<body><header><h1>Acme Inc</h1><p>We build tools that help developers ship faster. Simple, powerful, and beautiful.</p><a href="#" class="btn">Get Started</a></header></body>
</html>`,
		deployCount: 2,
	},
];

const LABELS = [
	"Initial deploy",
	"Fix typo in heading",
	"Update colors",
	"Add responsive styles",
	"Redesign hero section",
];

export function seedDatabase(userId: string) {
	const existing = db.select().from(site).all();
	if (existing.length > 0) return;

	for (const def of SITES) {
		const siteId = id();
		const now = new Date().toISOString();

		db.insert(site)
			.values({
				id: siteId,
				name: def.name,
				slug: def.slug,
				userId,
				status: "active",
				createdAt: ago(def.deployCount * 60 + 120),
				updatedAt: now,
			})
			.run();

		for (let i = 0; i < def.deployCount; i++) {
			const depId = id();
			const minutesAgo = (def.deployCount - i) * 30;
			const isLatest = i === def.deployCount - 1;

			db.insert(deployment)
				.values({
					id: depId,
					siteId,
					html: def.html,
					label: LABELS[i % LABELS.length],
					status: isLatest ? "live" : "superseded",
					url: `/s/${def.slug}`,
					size: new TextEncoder().encode(def.html).length,
					createdAt: ago(minutesAgo),
				})
				.run();
		}
	}
}
