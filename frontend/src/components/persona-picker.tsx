"use client";
import {useDemo,type Persona} from "@/components/demo-provider";
import {useAccessibility} from "@/components/accessibility-provider";
import {useEffect,useRef} from "react";
import type {AccessibilitySettings} from "@/lib/accessibility";
const labels:Record<Persona,string>={priya:"Priya — easier reading",sam:"Sam — text first",amara:"Amara — screen reader",alex:"Alex — calmer view"};
const presets:Record<Persona,Partial<AccessibilitySettings>>={
 priya:{textSize:"large",font:"lexend",language:"simple",speechEnabled:false,speakConfirmations:false},
 sam:{textSize:"default",font:"default",language:"simple",speechEnabled:false,speakConfirmations:false},
 amara:{textSize:"large",font:"atkinson",language:"simple",speechEnabled:true,speakConfirmations:true},
 alex:{textSize:"large",font:"default",language:"simple",motion:"reduce",speechEnabled:false,speakConfirmations:false}
};
export function PersonaPicker(){
 const {persona,setPersona}=useDemo();const {update}=useAccessibility();const last=useRef<Persona|null>(null);
 useEffect(()=>{document.documentElement.dataset.persona=persona;if(last.current!==persona){update(presets[persona]);last.current=persona;}},[persona,update]);
 return <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">Demo customer <select aria-label="Choose demo customer" className="rounded-lg border border-line bg-surface px-3 py-2 text-ink" value={persona} onChange={e=>setPersona(e.target.value as Persona)}>{(Object.keys(labels) as Persona[]).map(p=><option key={p} value={p}>{labels[p]}</option>)}</select></label>;
}
