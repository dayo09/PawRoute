"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, MapPin, RefreshCw, ExternalLink, Calendar, Dog, LayoutGrid, List, Bell, Sparkles, Terminal, Cpu, Database, CheckCircle2, Navigation, X } from "lucide-react";
import Image from "next/image";
import { calculateMatchScore } from "@/lib/matcher";

interface Sighting {
    title: string;
    content: string;
    region: string;
    imgUrl: string;
    link: string;
    source: 'Karrot' | 'PawInHand';
    timestamp: string;
    analysis?: {
        isDog: boolean;
        aiMatchScore: number;
        featureMatchScore: number;
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
    const [isAutoScan, setIsAutoScan] = useState(false);
    const [searchLocation, setSearchLocation] = useState("우면동");
    const [searchSido, setSearchSido] = useState("서울특별시");
    const [searchSigungu, setSearchSigungu] = useState("서초구");
    const [searchKeyword, setSearchKeyword] = useState("유기견");
    const [locationError, setLocationError] = useState<string | null>(null);

    const addLog = (message: string, type: LogEntry["type"] = "info") => {
        const newLog = {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            message,
            type
        };
        setLogs(prev => [newLog, ...prev].slice(0, 15));
    };

    useEffect(() => {
        const savedDog = localStorage.getItem("myDog");
        if (savedDog) {
            setMyDog(JSON.parse(savedDog));
        }
        // Initially trigger location check
        handleUseLocation();
    }, []);

    const validateLocation = (loc: string) => {
        const regex = /^[가-힣]+(동|읍|면)$/;
        if (!regex.test(loc)) {
            return "주소는 '동', '읍', 또는 '면'으로 끝나야 합니다. (예: 우면동)";
        }
        return null;
    };

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isAutoScan) {
            addLog("자동 탐색 모드 활성화: 3분마다 스캔을 실행합니다.", "success");
            interval = setInterval(() => {
                fetchSightings(location?.lat, location?.lon);
            }, 3 * 60 * 1000);
        }
        return () => clearInterval(interval);
    }, [isAutoScan, location, searchLocation, searchKeyword]);

    const handleUseLocation = () => {
        if ("geolocation" in navigator) {
            addLog("현재 위치 정보 요청 중...", "info");
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    setLocation({ lat: latitude, lon: longitude });
                    addLog("위치 승인 완료: 내 주변 동네를 탐색합니다.", "success");

                    // Try to reverse geocode to get the details
                    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`)
                        .then(res => res.json())
                        .then(data => {
                            const addr = data.address;
                            const dong = addr.suburb || addr.neighbourhood || addr.city_district || "";
                            const sido = addr.city || addr.province || "";
                            const sigungu = addr.county || addr.borough || addr.city_district || "";

                            if (dong && (dong.endsWith('동') || dong.endsWith('읍') || dong.endsWith('면'))) {
                                setSearchLocation(dong);
                            }
                            if (sido) setSearchSido(sido);
                            if (sigungu) setSearchSigungu(sigungu);

                            addLog(`현재 위치(${sido} ${sigungu} ${dong})로 설정했습니다.`, "info");
                        })
                        .catch(() => {
                            addLog("위치 정보를 상세히 가져오지 못했습니다. 직접 입력해 주세요.", "info");
                        });

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

    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const analyzePendingSightings = async (currentSightings: Sighting[], dog: any) => {
        const toAnalyze = currentSightings.filter(s => !s.analysis?.aiMatchScore);
        if (toAnalyze.length === 0) return;

        setIsAnalyzing(true);
        addLog(`${toAnalyze.length}개의 게시글 AI 분석을 시작합니다...`, "ai");

        const batchSize = 5;
        for (let i = 0; i < toAnalyze.length; i += batchSize) {
            const batch = toAnalyze.slice(i, i + batchSize);
            try {
                const response = await fetch('/api/analyze/batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: batch, dogProfile: dog })
                });
                const data = await response.json();

                if (data.results) {
                    setSightings(prev => {
                        const next = [...prev];
                        batch.forEach((item, idx) => {
                            const foundIdx = next.findIndex(s => s.link === item.link);
                            if (foundIdx !== -1 && data.results[idx]) {
                                next[foundIdx] = { ...next[foundIdx], analysis: data.results[idx] };
                            }
                        });
                        return next;
                    });
                    addLog(`${Math.min(i + batchSize, toAnalyze.length)}/${toAnalyze.length} 분석 완료...`, "ai");
                }
            } catch (err) {
                console.error("Batch analysis failed", err);
            }
        }
        setIsAnalyzing(false);
        addLog("모든 게시글 AI 분석이 완료되었습니다.", "success");
    };

    const fetchSightings = async (lat?: number, lon?: number) => {
        // Validate location first
        const error = validateLocation(searchLocation);
        if (error) {
            addLog(error, "warning");
            setLocationError(error);
            return;
        }
        setLocationError(null);

        setLoading(true);
        addLog("통합 스캔 엔진 기동 중 (당근마켓 + 포인핸드)...", "info");

        try {
            const body = {
                latitude: location?.lat,
                longitude: location?.lon,
                keyword: searchKeyword,
                location: searchLocation,
                sido: searchSido,
                sigungu: searchSigungu,
                dogProfile: myDog
            };

            const response = await fetch('/api/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await response.json();

            if (data.success) {
                addLog(`스캔 완료: 당근(${data.summary.karrot}) + 포인핸드(${data.summary.pawinhand})`, "success");

                // Filter by Lost Date if available
                let filtered = data.results;
                if (myDog?.lostDate) {
                    const lostTime = new Date(myDog.lostDate).getTime();
                    filtered = filtered.filter((s: any) => {
                        const sTime = new Date(s.timestamp || 0).getTime();
                        return sTime >= lostTime - (24 * 60 * 60 * 1000); // Allow 1 day grace
                    });
                }

                // Sort by timestamp, latest first
                const sortedSightings = filtered.sort((a: any, b: any) => {
                    const timeA = new Date(a.timestamp || 0).getTime();
                    const timeB = new Date(b.timestamp || 0).getTime();
                    return timeB - timeA;
                });

                setSightings(sortedSightings);

                if (myDog) {
                    const topMatch = sortedSightings.find((s: any) => (s.analysis?.aiMatchScore || 0) > 0.8);
                    if (topMatch) {
                        setNotification(`내 강아지와 매우 유사한 포스트가 발견되었습니다!`);
                    }
                }

                // Trigger background analysis for raw sightings
                analyzePendingSightings(sortedSightings, myDog);
            }
            else {
                addLog(`스캔 실패: ${data.error}`, "warning");
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
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2 text-primary">
                                <Terminal className="w-5 h-5" />
                                <h2 className="font-black text-sm uppercase tracking-widest text-white">Live Log</h2>
                            </div>
                            <button
                                onClick={() => setIsAutoScan(!isAutoScan)}
                                className={`px-3 py-1 rounded-full text-[10px] font-black tracking-tighter transition-all ${isAutoScan ? 'bg-primary text-white animate-pulse' : 'bg-slate-700 text-slate-400'}`}
                            >
                                {isAutoScan ? 'AUTO-SCAN ON' : 'AUTO-SCAN OFF'}
                            </button>
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
                            <span>내 위치 다시 설정하기</span>
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
                                <div className="flex-1 overflow-hidden">
                                    <h4 className="font-black text-white leading-tight truncate">{myDog.breed}</h4>
                                    <p className="text-xs text-slate-400 font-bold truncate">{myDog.size} • {myDog.primaryColor}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 space-y-5">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic mb-2">Search Filters</p>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 mb-2 block uppercase tracking-wider">시/도</label>
                                <input
                                    type="text"
                                    value={searchSido}
                                    onChange={(e) => setSearchSido(e.target.value)}
                                    placeholder="예: 서울특별시"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all placeholder:text-slate-300"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 mb-2 block uppercase tracking-wider">시/군/구</label>
                                <input
                                    type="text"
                                    value={searchSigungu}
                                    onChange={(e) => setSearchSigungu(e.target.value)}
                                    placeholder="예: 서초구"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all placeholder:text-slate-300"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-500 mb-2 block uppercase tracking-wider">탐색 동네 (동/읍/면)</label>
                            <div className="relative">
                                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                                <input
                                    type="text"
                                    value={searchLocation}
                                    onChange={(e) => setSearchLocation(e.target.value)}
                                    placeholder="예: 우면동"
                                    className={`w-full pl-11 pr-4 py-3.5 bg-slate-50 border ${locationError ? 'border-danger/50 ring-2 ring-danger/10' : 'border-slate-200'} rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all placeholder:text-slate-300`}
                                />
                            </div>
                            {locationError && (
                                <p className="text-[9px] text-danger mt-2 font-bold flex items-center gap-1">
                                    <X className="w-2 h-2" />
                                    {locationError}
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-500 mb-2 block uppercase tracking-wider">검색어</label>
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                                <input
                                    type="text"
                                    value={searchKeyword}
                                    onChange={(e) => setSearchKeyword(e.target.value)}
                                    placeholder="예: 유기견, 강아지"
                                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all placeholder:text-slate-300"
                                />
                            </div>
                        </div>
                    </div>
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
                                        <X className="w-8 h-8" />
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
                                {isAutoScan && (
                                    <div className="px-3 py-1 bg-primary/10 border border-primary/20 rounded-full flex items-center gap-2">
                                        <span className="text-[10px] font-black text-primary uppercase tracking-widest italic">Auto-Refresh Active</span>
                                    </div>
                                )}
                            </div>
                            <h1 className="text-6xl font-black text-secondary tracking-tighter mb-2 italic uppercase leading-none">Nearby Posts</h1>
                            <p className="text-slate-500 text-xl font-medium max-w-xl">당근마켓과 포인핸드를 Gemini AI가 실시간 감시하여 잃어버린 가족의 소식을 전해드립니다.</p>
                        </div>

                        <button
                            onClick={() => fetchSightings()}
                            disabled={loading}
                            className="px-10 py-6 bg-secondary text-white rounded-[2rem] font-black text-xl hover:bg-slate-800 transition-all shadow-2xl shadow-slate-300 active:scale-95 disabled:opacity-50 flex items-center gap-3 group"
                        >
                            <RefreshCw className={`w-6 h-6 ${loading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} />
                            <span>REFRESH</span>
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
                            <p className="text-3xl font-black text-slate-300 italic uppercase tracking-tighter">Analyzing Multi-source Feed...</p>
                        </div>
                    ) : (
                        <div className="space-y-12">
                            {/* Best Matches / Highlights */}
                            {sightings.filter((s: any) => (s.analysis?.aiMatchScore || 0) > 0.6).length > 0 && (
                                <section>
                                    <div className="flex items-center gap-3 mb-8">
                                        <Sparkles className="w-6 h-6 text-primary" />
                                        <h2 className="text-2xl font-black text-secondary italic uppercase tracking-tight">Best Matches</h2>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                        {sightings.filter((s: any) => (s.analysis?.aiMatchScore || 0) > 0.6).map((s: any, i: number) => {
                                            const featureScore = s.analysis?.featureMatchScore || 0;

                                            return (
                                                <motion.article
                                                    layout
                                                    key={`high-${i}`}
                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    className="bg-white rounded-[3.5rem] border border-slate-100 shadow-2xl ring-8 ring-primary/10 relative overflow-hidden group flex flex-col"
                                                >
                                                    <div className="absolute top-6 right-6 z-20 px-4 py-2 bg-white/90 backdrop-blur rounded-xl shadow-sm border border-slate-100 text-[10px] font-black text-slate-500 tracking-widest uppercase">
                                                        {s.source}
                                                    </div>

                                                    <div className="absolute top-8 left-8 z-20 flex flex-col gap-2">
                                                        <div className={`px-4 py-2 ${s.analysis ? 'bg-primary' : 'bg-slate-400 animate-pulse'} text-white rounded-xl shadow-xl flex items-center gap-2 font-black text-[10px] italic tracking-widest`}>
                                                            <Cpu className="w-3.5 h-3.5" />
                                                            {s.analysis ? `AI: ${Math.round((s.analysis.aiMatchScore || 0) * 100)}%` : 'ANALYZING...'}
                                                        </div>
                                                        {s.analysis ? (
                                                            <div className="px-4 py-2 bg-secondary text-white rounded-xl shadow-xl flex items-center gap-2 font-black text-[10px] italic tracking-widest">
                                                                <Dog className="w-3.5 h-3.5" />
                                                                FEATURES: {Math.round((s.analysis.featureMatchScore || 0) * 100)}%
                                                            </div>
                                                        ) : (
                                                            <div className="px-4 py-2 bg-slate-300 animate-pulse text-white rounded-xl shadow-xl flex items-center gap-2 font-black text-[10px] italic tracking-widest">
                                                                <Database className="w-3.5 h-3.5" />
                                                                MATCHING...
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="relative h-56 overflow-hidden">
                                                        <Image
                                                            src={s.imgUrl || "https://images.unsplash.com/photo-1543466835-00a7907e9de1"}
                                                            alt={s.title}
                                                            fill
                                                            className="object-cover group-hover:scale-105 transition-transform duration-1000"
                                                        />
                                                    </div>
                                                    <div className="p-8 flex flex-col flex-1">
                                                        <div className="flex items-center gap-2 text-slate-400 mb-3 font-black text-[9px] uppercase tracking-[0.2em]">
                                                            <MapPin className="w-3.5 h-3.5 text-primary" />
                                                            {s.region || "지역 정보 없음"}
                                                            <span className="mx-1">•</span>
                                                            <Calendar className="w-3 h-3" />
                                                            {new Date(s.timestamp).toLocaleDateString()}
                                                        </div>
                                                        <h3 className="text-2xl font-black text-secondary mb-4 italic tracking-tight">{s.title || "Found Dog"}</h3>
                                                        <p className="text-slate-500 font-medium text-base line-clamp-3 mb-8 leading-relaxed">{s.content}</p>
                                                        <a
                                                            href={s.link}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="mt-auto w-full py-4 bg-secondary text-white rounded-2xl font-black text-sm hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                                                        >
                                                            VIEW DETAILS
                                                            <ExternalLink className="w-4 h-4" />
                                                        </a>
                                                    </div>
                                                </motion.article>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}

                            {/* All Findings (Compact List) */}
                            <section>
                                <div className="flex items-center gap-3 mb-8">
                                    <List className="w-6 h-6 text-slate-400" />
                                    <h2 className="text-2xl font-black text-secondary italic uppercase tracking-tight">All Recent Findings</h2>
                                </div>
                                <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-100">
                                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Post Title / Content</th>
                                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Source</th>
                                                    <th className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">AI Match</th>
                                                    <th className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Feature Match</th>
                                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {sightings.map((s: any, i: number) => {
                                                    const featureScore = s.analysis?.featureMatchScore || 0;

                                                    return (
                                                        <tr key={`list-${i}`} className="hover:bg-slate-50/50 transition-colors group">
                                                            <td className="px-8 py-5">
                                                                <span className="text-xs font-bold text-slate-400 italic">
                                                                    {new Date(s.timestamp).toLocaleDateString()}
                                                                </span>
                                                            </td>
                                                            <td className="px-8 py-5">
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm font-black text-secondary group-hover:text-primary transition-colors line-clamp-1 italic tracking-tight">
                                                                        {s.title || s.content.substring(0, 40) + "..."}
                                                                    </span>
                                                                    <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                                                        <MapPin className="w-2.5 h-2.5" />
                                                                        {s.region || "Unknown Region"}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-8 py-5">
                                                                <span className={`px-3 py-1 rounded-lg text-[9px] font-black tracking-widest uppercase ${s.source === 'Karrot' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                                                                    {s.source}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-5 text-center">
                                                                {s.analysis ? (
                                                                    <span className={`text-[10px] font-black italic ${s.analysis.aiMatchScore > 0.6 ? 'text-primary' : 'text-slate-400'}`}>
                                                                        {Math.round(s.analysis.aiMatchScore * 100)}%
                                                                    </span>
                                                                ) : (
                                                                    <RefreshCw className="w-3 h-3 text-slate-300 animate-spin mx-auto" />
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-5 text-center">
                                                                {s.analysis ? (
                                                                    <span className={`text-[10px] font-black italic ${s.analysis.featureMatchScore > 0.6 ? 'text-secondary' : 'text-slate-400'}`}>
                                                                        {Math.round(s.analysis.featureMatchScore * 100)}%
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[9px] font-bold text-slate-200">-</span>
                                                                )}
                                                            </td>
                                                            <td className="px-8 py-5 text-right">
                                                                <a
                                                                    href={s.link}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="inline-flex items-center gap-1 text-xs font-black text-slate-300 hover:text-secondary transition-colors italic uppercase tracking-tighter"
                                                                >
                                                                    GO
                                                                    <ExternalLink className="w-3 h-3" />
                                                                </a>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    {sightings.length === 0 && !loading && (
                                        <div className="py-20 text-center">
                                            <div className="inline-flex p-4 bg-slate-50 rounded-2xl mb-4 text-slate-300">
                                                <Search className="w-8 h-8" />
                                            </div>
                                            <p className="text-sm font-bold text-slate-400 italic">검색 결과가 없습니다.</p>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
