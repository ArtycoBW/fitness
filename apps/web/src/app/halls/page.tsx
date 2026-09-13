import {Catalog,catalogTitles} from "@/features/landing/catalog";
export const metadata={title:catalogTitles.halls+" | Страйд",alternates:{canonical:"/halls"}};
export default function Page(){return <Catalog kind="halls"/>;}
