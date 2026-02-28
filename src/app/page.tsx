"use client";

import { motion } from "framer-motion";
import { Dog, Search, Bell, Shield, ArrowRight, MapPin, Sparkles } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-white overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary rounded-xl shadow-lg shadow-primary/20">
              <Dog className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-black text-secondary tracking-tighter italic">
              PawRoute
            </span>
          </div>
          <Link
            href="/register"
            className="px-5 py-2.5 bg-secondary text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 active:scale-95"
          >
            시작하기
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-50 text-primary rounded-full text-xs font-bold mb-6 border border-orange-100">
              <Sparkles className="w-3 h-3" />
              AI 기반 실시간 실종견 매칭 플랫폼
            </div>
            <h1 className="text-6xl lg:text-7xl font-black text-secondary leading-[1.1] tracking-tight mb-8">
              가장 소중한 가족을<br />
              <span className="text-primary italic">실시간</span>으로 찾으세요.
            </h1>
            <p className="text-lg text-slate-500 mb-10 max-w-lg leading-relaxed">
              트위터, 당근마켓, 지역 카페의 모든 목격 정보를 Gemini AI가 24시간 분석합니다.
              내 강아지의 특징과 매칭되는 즉시 스마트폰으로 알림을 보내드립니다.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/register"
                className="px-8 py-5 bg-primary text-white rounded-2xl font-black text-lg flex items-center justify-center gap-2 hover:bg-orange-600 transition-all shadow-2xl shadow-primary/30 active:scale-95 group"
              >
                내 강아지 등록하기
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/sightings"
                className="px-8 py-5 bg-slate-50 text-secondary border border-slate-200 rounded-2xl font-bold text-lg hover:bg-slate-100 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                실시간 목격 정보
                <Search className="w-5 h-5" />
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="relative"
          >
            <div className="relative aspect-square rounded-[3rem] bg-slate-100 overflow-hidden shadow-2xl border-8 border-white">
              <div className="absolute inset-0 bg-gradient-to-tr from-orange-100/50 to-teal-50/50" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Dog className="w-48 h-48 text-slate-200" />
              </div>
            </div>

            {/* Floating UI Elements */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="absolute -top-6 -right-6 p-6 bg-white rounded-3xl shadow-2xl border border-slate-100 flex items-center gap-4"
            >
              <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center">
                <Bell className="w-6 h-6 text-accent" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase">새로운 목격 정보</p>
                <p className="text-sm font-bold text-secondary">골든 리트리버 발견 (200m 근방)</p>
              </div>
            </motion.div>

            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 4, repeat: Infinity, delay: 0.5 }}
              className="absolute -bottom-10 -left-6 p-6 bg-white rounded-3xl shadow-2xl border border-slate-100 flex items-center gap-4"
            >
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                <Search className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase">AI 매칭 중</p>
                <p className="text-sm font-bold text-secondary">일치 확률 98% 분석 완료</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </main>

      {/* Stats Section */}
      <section className="bg-secondary py-20 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
          {[
            { icon: MapPin, title: "지역 커뮤니티 통합", desc: "당근, 트위터, 네이버 카페 실시간 스캔" },
            { icon: Shield, title: "프라이버시 보호", desc: "안전하게 관리되는 유저 정보와 데이터" },
            { icon: Sparkles, title: "Gemini 3 분석", desc: "멀티모달 이미지를 통한 정교한 특징 추출" }
          ].map((item, i) => (
            <div key={i} className="flex flex-col gap-4">
              <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center mb-2">
                <item.icon className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-white">{item.title}</h3>
              <p className="text-slate-400 leading-relaxed font-medium">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
