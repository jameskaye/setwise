import type {Metadata,Viewport} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Setwise — Strength log',description:'Log your sets. Find your next move. Your personal strength training history and adaptive workout coach.',icons:{icon:'/favicon.svg',apple:'/favicon.svg'}};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#f5f6f7'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
