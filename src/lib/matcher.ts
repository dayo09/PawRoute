export interface DogFeatures {
    breed?: string;
    size?: string;
    color?: string;
    primaryColor?: string;
    features?: string[];
}

export function calculateMatchScore(dog1: DogFeatures, dog2: DogFeatures): number {
    let score = 0;
    const totalWeight = 10;

    const normalize = (val: string) => {
        if (!val) return "";
        val = val.toLowerCase().trim();
        const map: Record<string, string> = {
            // Sizes
            "small": "소형", "medium": "중형", "large": "대형", "extra large": "대형",
            // Colors
            "white": "하얀색", "black": "검정색", "brown": "갈색", "grey": "회색", "gray": "회색",
            "golden": "노란색", "cream": "크림색", "yellow": "노란색", "red": "빨간색",
            // Breeds
            "poodle": "푸들", "maltiz": "말티즈", "maltese": "말티즈", "pomeranian": "포메라니안",
            "shih tzu": "시츄", "yorkshire terrier": "요크셔테리어", "golden retriever": "골든 리트리버",
            "jindo": "진돗개", "mixed": "믹스견", "mixed breed": "믹스견", "unknown": "믹스견",
            "korean jindo": "진돗개", "bichon": "비숑", "bichon frise": "비숑", "chihuahua": "치와와",
            "shiba": "시바견", "welsh corgi": "웰시코기", "corgi": "웰시코기", "dachshund": "닥스훈트",
            "beagle": "비글", "cocker spaniel": "코카스패니얼", "bulldog": "불독"
        };
        return map[val] || val;
    };

    const b1 = normalize(dog1.breed || "");
    const b2 = normalize(dog2.breed || "");
    const s1 = normalize(dog1.size || "");
    const s2 = normalize(dog2.size || "");
    const c1 = normalize(dog1.color || dog1.primaryColor || "");
    const c2 = normalize(dog2.color || dog2.primaryColor || "");
    const f1 = dog1.features || [];
    const f2 = dog2.features || [];

    // Breed match (High weight)
    if (b1 === b2 && b1 !== "") {
        score += 5;
    } else if (b1 !== "" && b2 !== "" && (b1.includes(b2) || b2.includes(b1))) {
        score += 3;
    }

    // Size match
    if (s1 === s2 && s1 !== "") {
        score += 2;
    }

    // Color match
    if (c1 !== "" && c2 !== "" && (c1.includes(c2) || c2.includes(c1))) {
        score += 2;
    }

    // Features match
    const commonFeatures = f1.filter(feat1 =>
        f2.some(feat2 => {
            const val1 = feat1.toLowerCase();
            const val2 = feat2.toLowerCase();
            return val1.includes(val2) || val2.includes(val1);
        })
    );
    if (commonFeatures.length > 0) {
        score += Math.min(commonFeatures.length, 1);
    }

    return score / totalWeight;
}
