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

    const b1 = (dog1.breed || "").toLowerCase();
    const b2 = (dog2.breed || "").toLowerCase();
    const s1 = (dog1.size || "").toLowerCase();
    const s2 = (dog2.size || "").toLowerCase();
    const c1 = (dog1.color || dog1.primaryColor || "").toLowerCase();
    const c2 = (dog2.color || dog2.primaryColor || "").toLowerCase();
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
