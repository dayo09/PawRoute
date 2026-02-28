"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, Dog, Sparkles, ArrowRight, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import Image from "next/image";

interface AnalysisResult {
    breed: string;
    size: string;
    primaryColor: string;
    secondaryColor: string;
    features: string[];
    confidence: number;
}

export default function RegisterPage() {
    const [images, setImages] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (images.length + files.length > 5) {
            alert("최대 5장의 사진만 업로드할 수 있습니다.");
            return;
        }

        const newImages = [...images, ...files];
        const newPreviews = files.map((file) => URL.createObjectURL(file));

        setImages(newImages);
        setPreviews([...previews, ...newPreviews]);
        setError(null);
    };

    const removeImage = (index: number) => {
        const newImages = [...images];
        const newPreviews = [...previews];
        newImages.splice(index, 1);
        newPreviews.splice(index, 1);
        setImages(newImages);
        setPreviews(newPreviews);
    };

    const handleAnalyze = async () => {
        if (images.length === 0) return;
        setIsAnalyzing(true);
        setError(null);
        setResult(null);

        try {
            const formData = new FormData();
            images.forEach((img) => formData.append("images", img));

            const response = await fetch("/api/analyze", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                throw new Error("분석 중 오류가 발생했습니다.");
            }

            const data = await response.json();
            setResult(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "분석에 실패했습니다.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleComplete = () => {
        if (result) {
            localStorage.setItem("myDog", JSON.stringify(result));
            alert("반려견 정보가 저장되었습니다! PawRoute가 실시간으로 일치하는 목격 글을 찾아 드릴게요.");
            window.location.href = "/sightings";
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                <header className="text-center mb-12">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="inline-flex items-center justify-center p-3 bg-primary rounded-2xl mb-4 shadow-lg shadow-primary/20"
                    >
                        <Dog className="w-8 h-8 text-white" />
                    </motion.div>
                    <h1 className="text-4xl font-bold text-secondary tracking-tight mb-2">
                        반려견 등록하기
                    </h1>
                    <p className="text-slate-500 text-lg font-medium">
                        강아지의 사진으로부터 특징을 분석합니다.
                    </p>
                </header>

                <section className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-8 border border-slate-100 overflow-hidden relative">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                        <AnimatePresence>
                            {previews.map((preview, index) => (
                                <motion.div
                                    key={preview}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="relative aspect-square rounded-2xl overflow-hidden border-2 border-slate-100 group"
                                >
                                    <Image
                                        src={preview}
                                        alt={`Preview ${index}`}
                                        fill
                                        className="object-cover"
                                    />
                                    <button
                                        onClick={() => removeImage(index)}
                                        className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur rounded-full text-danger opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {previews.length < 5 && (
                            <label className="aspect-square rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-orange-50 transition-all group">
                                <div className="p-3 bg-white rounded-xl shadow-sm group-hover:scale-110 transition-transform">
                                    <Upload className="w-6 h-6 text-slate-400 group-hover:text-primary" />
                                </div>
                                <span className="mt-2 text-sm font-medium text-slate-400 group-hover:text-primary">
                                    사진 추가 ({previews.length}/5)
                                </span>
                                <input
                                    type="file"
                                    multiple
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleImageUpload}
                                />
                            </label>
                        )}
                    </div>

                    <div className="flex flex-col gap-4">
                        <button
                            onClick={handleAnalyze}
                            disabled={images.length === 0 || isAnalyzing}
                            className={`w-full py-4 px-6 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${images.length > 0 && !isAnalyzing
                                ? "bg-primary text-white hover:bg-orange-600 shadow-primary/30 active:scale-95"
                                : "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none"
                                }`}
                        >
                            {isAnalyzing ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Gemini가 분석 중...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-5 h-5 font-bold" />
                                    AI로 특징 분석하기
                                </>
                            )}
                        </button>
                        {error && (
                            <motion.p
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-danger text-sm flex items-center justify-center gap-1 font-medium"
                            >
                                <AlertCircle className="w-4 h-4" />
                                {error}
                            </motion.p>
                        )}
                    </div>

                    <AnimatePresence>
                        {result && (
                            <motion.div
                                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                animate={{ opacity: 1, height: "auto", marginTop: 32 }}
                                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                className="border-t pt-8"
                            >
                                <h2 className="text-xl font-bold text-secondary mb-6 flex items-center gap-2">
                                    <CheckCircle2 className="w-6 h-6 text-accent" />
                                    분석 결과
                                </h2>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">강아지 품종</label>
                                            <p className="text-lg font-bold text-secondary">{result.breed}</p>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">크기</label>
                                            <p className="text-lg font-bold text-secondary">{result.size}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">털 색상</label>
                                            <p className="text-lg font-bold text-secondary">
                                                {result.primaryColor}{result.secondaryColor && `, ${result.secondaryColor}`}
                                            </p>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">특이사항</label>
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                {result.features.map((f, i) => (
                                                    <span key={i} className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-semibold text-slate-600">
                                                        {f}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8">
                                    <button
                                        onClick={handleComplete}
                                        className="w-full py-4 bg-secondary text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-[0.98]"
                                    >
                                        등록 완료하기
                                        <ArrowRight className="w-5 h-5" />
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </section>
            </div>
        </div>
    );
}
