"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, MapPin, RefreshCw, ExternalLink, Calendar, Dog, LayoutGrid, List, Bell, Sparkles, Terminal, Cpu, Database, CheckCircle2, Navigation } from "lucide-react";
import Image from "next/image";
import { calculateMatchScore } from "@/lib/matcher";

interface Sighting {
    title: string;
    content: string;
    region: string;
    imgUrl: string;
    link: string;
    analysis?: {
        isDog: boolean;
        breed: string;
        size: string;
        color: string;
        features: string[];
        isLostOrFound: string;
    };
}

interface LogEntry {
    id: string;
    timestamp: string;
    message: string;
    type: "info" | "ai" | "success" | "warning";
}

export default function SightingsPage() {
    const [sightings, setSightings] = useState<Sighting[]>([]);
    const [loading, setLoading] = useState(true);
    const [myDog, setMyDog] = useState<any>(null);
    const [notification, setNotification] = useState<string | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [location, setLocation] = useState<{ lat: number, lon: number } | null>(null);

    const addLog = (message: string, type: LogEntry["type"] = "info") => {
        const newLog = {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            message,
            type
        };
        setLogs(prev => [newLog, ...prev].slice(0, 10));
    };

    useEffect(() => {
        const savedDog = localStorage.getItem("myDog");
        if (savedDog) {
            setMyDog(JSON.parse(savedDog));
        }
        // Try to get location on mount
        handleUseLocation();
    }, []);

    const handleUseLocation = () => {
        if ("geolocation" in navigator) {
            addLog("현재 위치 정보 요청 중...", "info");
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    setLocation({ lat: latitude, lon: longitude });
                    addLog("위치 승인 완료: 내 주변 동네를 탐색합니다.", "success");
                    fetchSightings(latitude, longitude);
                },
                (error) => {
                    addLog("위치 정보를 가져올 수 없습니다. 기본 지역으로 검색합니다.", "warning");
                    fetchSightings();
                }
            );
        } else {
            addLog("브라우저가 위치 정보를 지원하지 않습니다.", "warning");
            fetchSightings();
        }
    };

    const fetchSightings = async (lat?: number, lon?: number) => {
        setLoading(true);
        setLogs([]);
        addLog("스크래핑 엔진 초기화 중...", "info");
        addLog("당근마켓 '동네생활' 섹션 접근 중...", "info");

        try {
            const resp = await fetch("/api/scrape/karrot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    latitude: lat || location?.lat || 37.5665,
                    longitude: lon || location?.lon || 126.9780
                })
            });
            const data = await resp.json();

            if (data.success) {
                addLog(data.isMock ? "데모 모드: 시뮬레이션 데이터를 불러왔습니다." : `${data.data.length}개의 관련 게시글을 발견했습니다.`, "success");
                addLog("Gemini 3 멀티모달 분석 엔진 가동...", "ai");

                data.data.forEach((s: Sighting, i: number) => {
                    if (s.analysis) {
                        addLog(`[Sighting ${i + 1}] 분석: ${s.analysis.breed} / ${s.analysis.features[0] || "특징 분석 중"}`, "ai");
                    }
                });

                setSightings(data.data);

                if (myDog) {
                    const matches = data.data.filter((s: Sighting) => {
                        if (!s.analysis) return false;
                        const score = calculateMatchScore(myDog, {
                            breed: s.analysis.breed,
                            size: s.analysis.size,
                            color: s.analysis.color,
                            features: s.analysis.features
                        });
                        return score > 0.6;
                    });

                    if (matches.length > 0) {
                        setNotification(`${matches.length}마리의 일치하는 강아지가 발견되었습니다!`);
                        addLog(`매칭 발견! 일치율 ${Math.round(calculateMatchScore(myDog, matches[0].analysis!) * 100)}%`, "success");
                    } else {
                        addLog("현재 일치하는 목격 정보가 없습니다.", "warning");
                    }
                }
            } else {
                addLog(`스크래핑 실패: ${data.error}`, "warning");
            }
        } catch (err) {
            addLog("네트워크 오류 발생", "warning");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8">

                {/* Left Sidebar: Process Logs and Location */}
                <aside className="lg:col-span-1 space-y-6">
                    <div className="bg-secondary p-6 rounded-[2rem] shadow-2xl border border-slate-800 flex flex-col h-[500px]">
                        <div className="flex items-center gap-2 mb-6 text-primary">
                            <Terminal className="w-5 h-5" />
                            <h2 className="font-black text-sm uppercase tracking-widest text-white">Live Process Log</h2>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-3 font-mono text-[11px]">
                            <AnimatePresence initial={false}>
                                {logs.map((log) => (
                                    <motion.div
                                        key={log.id}
                                        initial={{ opacity: 0, x: -5 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className={`p-3 rounded-xl border ${log.type === "ai" ? "bg-primary/10 border-primary/20 text-primary" :
                                                log.type === "success" ? "bg-accent/10 border-accent/20 text-accent" :
                                                    log.type === "warning" ? "bg-danger/10 border-danger/20 text-danger" :
                                                        "bg-slate-800 border-slate-700 text-slate-400"
                                            }`}
                                    >
                                        <span className="opacity-40 mr-1">[{log.timestamp}]</span>
                                        {log.message}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50">
                        <button
                            onClick={handleUseLocation}
                            className="w-full py-4 px-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center gap-2 font-bold text-secondary hover:bg-slate-100 transition-all active:scale-95 mb-4"
                        >
                            <Navigation className="w-4 h-4 text-primary" />
                            내 위치 다시 설정하기
                        </button>
                        {location ? (
                            <div className="text-center">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Neighborhood</p>
                                <p className="text-sm font-bold text-secondary flex items-center justify-center gap-1">
                                    <MapPin className="w-3 h-3 text-accent" />
                                    위치 기반 탐색 중
                                </p>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400 text-center font-medium">위치 권한을 허용하시면<br />동네생활 게시글을 우선으로 찾습니다.</p>
                        )}
                    </div>

                    {myDog && (
                        <div className="bg-secondary p-6 rounded-[2rem] border border-slate-700 shadow-xl text-white">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 italic">Tracking Profile</p>
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10">
                                    <Dog className="w-6 h-6 text-primary" />
                                </div>
                                <div>
                                    <h4 className="font-black text-white leading-tight">{myDog.breed}</h4>
                                    <p className="text-xs text-slate-400 font-bold">{myDog.size} • {myDog.primaryColor}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </aside>

                {/* Main Content: Sightings */}
                <div className="lg:col-span-3">
                    <AnimatePresence>
                        {notification && (
                            <motion.div
                                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="mb-10"
                            >
                                <div className="bg-primary text-white p-8 rounded-[3rem] shadow-2xl flex items-center gap-8 border-b-8 border-orange-600 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                                    <div className="w-20 h-20 bg-white/20 rounded-[2rem] flex items-center justify-center shrink-0 shadow-inner">
                                        <Bell className="w-10 h-10 animate-ring" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-black text-3xl tracking-tighter italic mb-1 uppercase">Match Found!</h4>
                                        <p className="font-bold text-xl opacity-90">{notification}</p>
                                    </div>
                                    <button
                                        onClick={() => setNotification(null)}
                                        className="p-4 bg-black/10 hover:bg-black/20 rounded-full transition-transform hover:rotate-90"
                                    >
                                        <Search className="w-8 h-8 rotate-45" />
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="px-3 py-1 bg-accent/10 border border-accent/20 rounded-full flex items-center gap-2">
                                    <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                                    <span className="text-[10px] font-black text-accent uppercase tracking-widest italic">Live Scanning</span>
                                </div>
                            </div>
                            <h1 className="text-6xl font-black text-secondary tracking-tighter mb-2 italic uppercase leading-none">Nearby Posts</h1>
                            <p className="text-slate-500 text-xl font-medium max-w-xl">당근마켓 동네생활 섹션을 Gemini 3가 24시간 감시하여 내 주변의 유기견 소식을 전해드립니다.</p>
                        </div>

                        <button
                            onClick={() => fetchSightings()}
                            disabled={loading}
                            className="px-10 py-6 bg-secondary text-white rounded-[2rem] font-black text-xl hover:bg-slate-800 transition-all shadow-2xl shadow-slate-300 active:scale-95 disabled:opacity-50 flex items-center gap-3 group"
                        >
                            <RefreshCw className={`w-6 h-6 ${loading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} />
                            REFRESH
                        </button>
                    </header>

                    {loading && sightings.length === 0 ? (
                        <div className="py-40 flex flex-col items-center justify-center bg-white rounded-[3.5rem] border border-slate-100 shadow-sm relative overflow-hidden text-center">
                            <div className="absolute inset-x-0 top-0 h-2 bg-slate-50">
                                <motion.div
                                    animate={{ x: ["-100%", "100%"] }}
                                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                                    className="h-full w-1/3 bg-primary"
                                />
                            </div>
                            <Cpu className="w-20 h-20 text-slate-100 mb-8 animate-pulse" />
                            <p className="text-3xl font-black text-slate-300 italic uppercase tracking-tighter">Analyzing Community Feed...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <AnimatePresence mode="popLayout">
                                {sightings.map((s, i) => {
                                    const matchScore = myDog && s.analysis ? calculateMatchScore(myDog, {
                                        breed: s.analysis.breed,
                                        size: s.analysis.size,
                                        color: s.analysis.color,
                                        features: s.analysis.features
                                    }) : 0;
                                    const isMatch = matchScore > 0.6;

                                    return (
                                        <motion.article
                                            layout
                                            key={i}
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className={`bg-white rounded-[3.5rem] border border-slate-100 shadow-2xl shadow-slate-200/40 relative overflow-hidden group flex flex-col ${isMatch ? "ring-8 ring-primary/20" : ""}`}
                                        >
                                            {isMatch && (
                                                <div className="absolute top-8 left-8 z-20 px-6 py-3 bg-primary text-white rounded-2xl shadow-2xl flex items-center gap-2 font-black text-sm animate-bounce italic tracking-widest">
                                                    <CheckCircle2 className="w-5 h-5 font-bold" />
                                                    {Math.round(matchScore * 100)}% MATCH
                                                </div>
                                            )}

                                            <div className="relative aspect-[4/3] overflow-hidden">
                                                <Image
                                                    src={s.imgUrl || "https://images.unsplash.com/photo-1543466835-00a7907e9de1"}
                                                    alt={s.title}
                                                    fill
                                                    className="object-cover group-hover:scale-105 transition-transform duration-1000"
                                                />
                                                <div className="absolute bottom-6 left-6 flex gap-2">
                                                    <span className={`px-5 py-2.5 rounded-2xl text-[10px] font-black shadow-2xl backdrop-blur-xl border border-white/20 ${s.analysis?.isLostOrFound === "found" ? "bg-accent text-white" : "bg-primary text-white"}`}>
                                                        {s.analysis?.isLostOrFound === "found" ? "SIGHTED / RESCUED" : "LOST"}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="p-10 flex flex-col flex-1">
                                                <div className="flex items-center gap-2 text-slate-400 mb-5 font-black text-[10px] uppercase tracking-[0.3em]">
                                                    <MapPin className="w-4 h-4 text-primary" />
                                                    {s.region}
                                                </div>
                                                <h3 className="text-3xl font-black text-secondary mb-5 line-clamp-1 italic tracking-tight">{s.title || "Untitled Sighting"}</h3>
                                                <p className="text-slate-500 font-medium text-lg line-clamp-2 mb-10 leading-relaxed">{s.content}</p>

                                                <div className="mt-auto flex items-center justify-between pt-8 border-t border-slate-100">
                                                    <div className="flex -space-x-3">
                                                        {[1, 2, 3].map((_, idx) => (
                                                            <div key={idx} className="w-12 h-12 rounded-2xl bg-slate-50 border-4 border-white flex items-center justify-center shadow-sm">
                                                                <Sparkles className="w-5 h-5 text-slate-300" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <a
                                                        href={s.link}
                                                        target="_blank"
                                                        className="px-6 py-3 bg-secondary text-white rounded-2xl font-black text-xs hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-200"
                                                    >
                                                        VIEW ORIGIN
                                                        <ExternalLink className="w-4 h-4" />
                                                    </a>
                                                </div>
                                            </div>
                                        </motion.article>
                                    );
                                })}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
