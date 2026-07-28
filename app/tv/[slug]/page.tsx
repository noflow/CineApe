import type { Metadata } from "next";
import { PublicTitlePage, publicTitleMetadata } from "../../title-public-page";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return publicTitleMetadata("tv", slug);
}

export default async function TvPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicTitlePage type="tv" slug={slug} />;
}
