import type { Metadata } from "next";
import { PublicTitlePage, publicTitleMetadata } from "../../title-public-page";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return publicTitleMetadata("movie", slug);
}

export default async function MoviePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicTitlePage type="movie" slug={slug} />;
}
