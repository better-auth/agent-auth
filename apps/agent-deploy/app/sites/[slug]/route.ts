import { NextResponse } from "next/server";
import { getSiteBySlug } from "@/lib/db";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ slug: string }> }
) {
	const { slug } = await params;
	const site = getSiteBySlug(slug);
	if (!site) {
		return new NextResponse(
			"<!DOCTYPE html><html><body><h1>404 — Site not found</h1></body></html>",
			{
				status: 404,
				headers: { "content-type": "text/html; charset=utf-8" },
			}
		);
	}
	return new NextResponse(site.html, {
		headers: { "content-type": "text/html; charset=utf-8" },
	});
}
