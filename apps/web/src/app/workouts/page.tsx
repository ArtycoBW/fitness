import {Catalog,catalogTitles} from "@/features/landing/catalog";
export const metadata={title:catalogTitles.workouts+" | Страйд",alternates:{canonical:"/workouts"}};
export default function Page(){return <Catalog kind="workouts"/>;}
