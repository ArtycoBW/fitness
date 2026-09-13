import {ImageResponse} from "next/og";
export const size={width:1200,height:630};
export const contentType="image/png";
export default function Image(){return new ImageResponse(<div style={{background:"#e1f4df",color:"#0f3e17",width:"100%",height:"100%",display:"flex",flexDirection:"column",padding:70,justifyContent:"space-between"}}><div style={{fontSize:34}}>страйд / клуб движения</div><div style={{fontSize:88,letterSpacing:-4,maxWidth:880,lineHeight:1.04}}>Движение в вашем ритме.</div><div style={{fontSize:23}}>Тренировки · Абонементы · Программы занятий</div></div>,size);}
