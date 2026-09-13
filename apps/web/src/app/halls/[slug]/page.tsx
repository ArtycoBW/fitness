import {Catalog,catalogTitles} from "@/features/landing/catalog";
import {publicApi} from "@/lib/public-api";
import type {PublicItem} from "@/features/landing/types";
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const list=await publicApi<PublicItem[]>("halls/"+encodeURIComponent(slug));const item=list?.[0];return {title:(item?.name??catalogTitles.halls)+" | Страйд",description:item?.description??item?.bio,alternates:{canonical:"/halls/"+encodeURIComponent(slug)}};}
export default async function Page({params}:{params:Promise<{slug:string}>}){return <Catalog kind="halls" slug={(await params).slug}/>;}
