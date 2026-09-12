import {MembershipDetail} from '@/features/memberships/memberships';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <MembershipDetail area="account" id={id}/>;}
