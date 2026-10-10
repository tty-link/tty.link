(function (global) {
  "use strict";

  var VERSION = "0.4.0";

  /* 페이지당 런타임은 하나다. classic <script>와 ESM 진입점(이 파일을 side
   * effect로 import한다)이 함께 로드되면 두 인스턴스가 host 상태·observer·
   * stylesheet 리스너를 따로 가져 서로의 host를 모른다. custom element
   * 레지스트리처럼 먼저 로드된 쪽이 이기고, 버전이 다르면 한 번 경고한다. */
  var EXISTING_RUNTIME = global && global.FontKku;
  if (EXISTING_RUNTIME &&
      typeof EXISTING_RUNTIME.render === "function" &&
      typeof EXISTING_RUNTIME.renderText === "function" &&
      typeof EXISTING_RUNTIME.version === "string") {
    if (EXISTING_RUNTIME.version !== VERSION && typeof console !== "undefined" && console.warn) {
      console.warn("font-kku: runtime " + EXISTING_RUNTIME.version +
        " is already loaded; this copy (" + VERSION + ") reuses it");
    }
    if (typeof module !== "undefined" && module.exports) {
      module.exports = EXISTING_RUNTIME;
    }
    return;
  }

  var STATE = new WeakMap();
  var GLYPH_CACHE = new Map();
  /* 캐시 키에 depth 조합이 들어가므로 조합을 섞어 쓰는 페이지에서는 실효
   * 용량이 조합 수만큼 나뉜다. LRU라 정확성에는 영향이 없고, 통상 페이지는
   * 한 조합만 쓴다 — 6조합을 동시에 섞는 극단 케이스를 위해 넉넉히 잡는다. */
  var GLYPH_CACHE_MAX = 4096;
  var MODEL_CACHE = new Map();
  var MODEL_CACHE_MAX = 64;
  /* 모델 한 개는 글자당 수백 바이트다. 긴 host를 키 입력마다 다시 그리는
   * 에디터가 64벌을 붙잡지 않도록 항목 수와 함께 총 글자 수로도 묶는다. 긴
   * 텍스트는 그대로 반복되는 일이 드물어 캐시하지 않는다. */
  var MODEL_CACHE_MAX_CHARS = 16384;
  var MODEL_CACHE_ENTRY_MAX_CHARS = 2048;
  var modelCacheChars = 0;
  var DEFAULT_FONT = "sebul";
  var DEFAULT_EXPRESSION_MODE = "sebeol";
  /* 자모 분해 깊이는 서로 독립인 두 옵션이다: 합자 모음(ㅘ ㅢ 계열)을 어떻게
   * 그릴지와 겹받침(ㄼ 계열)을 어떻게 그릴지. --fy-jamo-depth는 두 값을 한 번에
   * 정하는 shorthand이고, longhand가 선언되면 shorthand보다 우선한다. */
  var DEFAULT_VOWEL_DEPTH = "split";
  var DEFAULT_CODA_DEPTH = "split";
  var VOWEL_DEPTHS = { split: true, whole: true, syllable: true };
  var CODA_DEPTHS = { split: true, whole: true };
  var JAMO_DEPTH_SHORTHANDS = {
    atomic: { vowel: "split", coda: "split" },
    composite: { vowel: "whole", coda: "whole" },
    syllable: { vowel: "syllable", coda: "whole" }
  };
  var SUPPORTED_FONT_CONTRACT = 2;
  var CONTRACT_WARNINGS = {};
  var FONT_ALIASES = {
    "default": "sebul",
    "classic": "sebul",
    "gothic2": "gothic"
  };

  var HANGUL_BASE = 0xac00;
  var HANGUL_END = 0xd7a3;
  var HANGUL_TABLES = {
    choseong: [
      "ᄀ", "ᄁ", "ᄂ", "ᄃ", "ᄄ", "ᄅ", "ᄆ", "ᄇ", "ᄈ", "ᄉ",
      "ᄊ", "ᄋ", "ᄌ", "ᄍ", "ᄎ", "ᄏ", "ᄐ", "ᄑ", "ᄒ"
    ],
    jungseong: [
      "ᅡ", "ᅢ", "ᅣ", "ᅤ", "ᅥ", "ᅦ", "ᅧ", "ᅨ", "ᅩ", "ᅪ",
      "ᅫ", "ᅬ", "ᅭ", "ᅮ", "ᅯ", "ᅰ", "ᅱ", "ᅲ", "ᅳ", "ᅴ", "ᅵ"
    ],
    jongseong: [
      "", "ᆨ", "ᆩ", "ᆪ", "ᆫ", "ᆬ", "ᆭ", "ᆮ", "ᆯ", "ᆰ",
      "ᆱ", "ᆲ", "ᆳ", "ᆴ", "ᆵ", "ᆶ", "ᆷ", "ᆸ", "ᆹ", "ᆺ",
      "ᆻ", "ᆼ", "ᆽ", "ᆾ", "ᆿ", "ᇀ", "ᇁ", "ᇂ"
    ],
    splitJungseong: {
      "ᅪ": { parts: ["ᅩ", "ᅡ"], display: ["ᅩ", "ᅡ"], layout: "split-right" },
      "ᅫ": { parts: ["ᅩ", "ᅢ"], display: ["ᅩ", "ᅢ"], layout: "split-right" },
      "ᅬ": { parts: ["ᅩ", "ᅵ"], display: ["ᅩ", "ᅵ"], layout: "split-right" },
      "ᅯ": { parts: ["ᅮ", "ᅥ"], display: ["ᅮ", "ᅥ"], layout: "split-right" },
      "ᅰ": { parts: ["ᅮ", "ᅦ"], display: ["ᅮ", "ᅦ"], layout: "split-right" },
      "ᅱ": { parts: ["ᅮ", "ᅵ"], display: ["ᅮ", "ᅵ"], layout: "split-right" },
      "ᅴ": { parts: ["ᅳ", "ᅵ"], display: ["ᅳ", "ᅵ"], layout: "split-right" }
    },
    bottomJungseong: {
      "ᅩ": true,
      "ᅭ": true,
      "ᅮ": true,
      "ᅲ": true,
      "ᅳ": true
    },
    doubleJongseong: {
      "ᆪ": { parts: ["ᆨ", "ᆺ"], display: ["ᆨ", "ᆺ"], layout: "double" },
      "ᆬ": { parts: ["ᆫ", "ᆽ"], display: ["ᆫ", "ᆽ"], layout: "double" },
      "ᆭ": { parts: ["ᆫ", "ᇂ"], display: ["ᆫ", "ᇂ"], layout: "double" },
      "ᆰ": { parts: ["ᆯ", "ᆨ"], display: ["ᆯ", "ᆨ"], layout: "double" },
      "ᆱ": { parts: ["ᆯ", "ᆷ"], display: ["ᆯ", "ᆷ"], layout: "double" },
      "ᆲ": { parts: ["ᆯ", "ᆸ"], display: ["ᆯ", "ᆸ"], layout: "double" },
      "ᆳ": { parts: ["ᆯ", "ᆺ"], display: ["ᆯ", "ᆺ"], layout: "double" },
      "ᆴ": { parts: ["ᆯ", "ᇀ"], display: ["ᆯ", "ᇀ"], layout: "double" },
      "ᆵ": { parts: ["ᆯ", "ᇁ"], display: ["ᆯ", "ᇁ"], layout: "double" },
      "ᆶ": { parts: ["ᆯ", "ᇂ"], display: ["ᆯ", "ᇂ"], layout: "double" },
      "ᆹ": { parts: ["ᆸ", "ᆺ"], display: ["ᆸ", "ᆺ"], layout: "double" }
    }
  };
  var SPRITE_JAMO_TABLES = {
    consonant: [
      "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
      "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
    ],
    vowel: [
      "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
      "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"
    ],
    // 겹받침 통짜(coda-depth: whole) 칸 — 시트 4행째(선택 확장). 종성 순서.
    codaCluster: [
      "ㄳ", "ㄵ", "ㄶ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅄ"
    ]
  };
  var PLACEMENT_TABLE = {
    "bottom:none": {
      choseong: ["t"],
      jungseong: ["m"],
      jongseong: []
    },
    "bottom:single": {
      choseong: ["tt"],
      jungseong: ["mt"],
      jongseong: ["b"]
    },
    "bottom:double": {
      choseong: ["tt"],
      jungseong: ["mt"],
      jongseong: ["bl", "br"]
    },
    "right:none": {
      choseong: ["tlo"],
      jungseong: ["tro"],
      jongseong: []
    },
    "right:single": {
      choseong: ["tlc"],
      jungseong: ["trc"],
      jongseong: ["brs"]
    },
    "right:double": {
      choseong: ["tlc"],
      jungseong: ["trc"],
      jongseong: ["blr", "brd"]
    },
    "split-right:none": {
      choseong: ["tls"],
      jungseong: ["ml", "trs"],
      jongseong: []
    },
    "split-right:single": {
      choseong: ["ttl"],
      jungseong: ["mtl", "ttr"],
      jongseong: ["bbrs"]
    },
    "split-right:double": {
      choseong: ["ttl"],
      jungseong: ["mtl", "ttr"],
      jongseong: ["bbl", "bbrd"]
    }
  };

  /* 두 depth 축은 서로 다른 열만 건드린다: 모음축은 head/choseong/jungseong,
   * 받침축은 jongseong. 표를 depth 조합마다 손으로 쓰는 대신 base(atomic) 위에
   * 축별 override를 합성한다 — 공유 행이 드리프트할 수 없고, 어떤 조합이든
   * (예: 모음 syllable + 받침 split) 같은 규칙으로 만들어진다. */
  var VOWEL_PLACEMENT_OVERRIDES = {
    /* whole: 합자 모음(ᅪ)을 한 노드로 — layout은 그대로 split-right */
    whole: {
      "split-right:none": { jungseong: ["mw"] },
      "split-right:single": { jungseong: ["mtw"] },
      "split-right:double": { jungseong: ["mtw"] }
    },
    /* syllable: 초성+모음 base를 완성형 head로, tail만 남긴다 ("과"→"고"+ㅏ).
     * 2010 ptext 원형이 $jung_tmp 분기에서 base/tail을 나누던 그 경계다. */
    syllable: {
      "split-right:none": { head: ["hs"], choseong: [], jungseong: ["trs"] },
      "split-right:single": { head: ["hts"], choseong: [], jungseong: ["ttr"] },
      "split-right:double": { head: ["hts"], choseong: [], jungseong: ["ttr"] }
    }
  };
  var CODA_PLACEMENT_OVERRIDES = {
    /* whole: 겹받침(ᆲ)을 한 노드로 */
    whole: {
      "bottom:double": { jongseong: ["bw"] },
      "right:double": { jongseong: ["brw"] },
      "split-right:double": { jongseong: ["bbw"] }
    }
  };

  function composePlacementTable(vowelDepth, codaDepth) {
    var vowelOverrides = VOWEL_PLACEMENT_OVERRIDES[vowelDepth] || {};
    var codaOverrides = CODA_PLACEMENT_OVERRIDES[codaDepth] || {};
    var composed = {};
    Object.keys(PLACEMENT_TABLE).forEach(function (key) {
      var base = PLACEMENT_TABLE[key];
      var vowel = vowelOverrides[key] || {};
      var coda = codaOverrides[key] || {};
      composed[key] = {
        head: (vowel.head || []).slice(),
        choseong: (vowel.choseong || base.choseong).slice(),
        jungseong: (vowel.jungseong || base.jungseong).slice(),
        jongseong: (coda.jongseong || base.jongseong).slice()
      };
    });
    return composed;
  }

  /* 6조합 전부를 미리 합성해 둔다 (렌더 경로에서 합성 비용 없음). */
  var PLACEMENT_TABLES_BY_COMBO = {};
  Object.keys(VOWEL_DEPTHS).forEach(function (vowelDepth) {
    PLACEMENT_TABLES_BY_COMBO[vowelDepth] = {};
    Object.keys(CODA_DEPTHS).forEach(function (codaDepth) {
      PLACEMENT_TABLES_BY_COMBO[vowelDepth][codaDepth] =
        composePlacementTable(vowelDepth, codaDepth);
    });
  });

  function createPublicPlacementTable(table) {
    var copy = {};
    Object.keys(table).forEach(function (key) {
      var entry = table[key];
      copy[key] = Object.freeze({
        head: Object.freeze((entry.head || []).slice()),
        choseong: Object.freeze(entry.choseong.slice()),
        jungseong: Object.freeze(entry.jungseong.slice()),
        jongseong: Object.freeze(entry.jongseong.slice())
      });
    });
    return Object.freeze(copy);
  }

  /* Public consumers can inspect the placement contract without receiving a
   * mutable reference to the table used by the renderer. The three named
   * presets remain the documented surface; other combos are internal. */
  var PUBLIC_PLACEMENT_TABLE = createPublicPlacementTable(
    PLACEMENT_TABLES_BY_COMBO.split.split
  );
  var PUBLIC_PLACEMENT_TABLES = Object.freeze({
    atomic: PUBLIC_PLACEMENT_TABLE,
    composite: createPublicPlacementTable(PLACEMENT_TABLES_BY_COMBO.whole.whole),
    syllable: createPublicPlacementTable(PLACEMENT_TABLES_BY_COMBO.syllable.whole)
  });

  /* Hand-written copies replace the previous JSON round-trip clone.
   * The copied shapes are fixed (glyph/model trees below), so shallow
   * object copies plus array slices are enough to keep cache entries
   * isolated from caller mutation. */

  function copyJamoTriple(triple) {
    var copy = {
      choseong: triple.choseong.slice(),
      jungseong: triple.jungseong.slice(),
      jongseong: triple.jongseong.slice()
    };
    /* `head` only exists on the display side of syllable depth, so it is copied
     * when present instead of being forced onto every triple. */
    if (triple.head) {
      copy.head = triple.head.slice();
    }
    if (triple.headBase) {
      copy.headBase = triple.headBase;
    }
    return copy;
  }

  function copyGlyph(glyph) {
    var copy = {
      type: glyph.type,
      index: glyph.index,
      source: glyph.source,
      kind: glyph.kind,
      vowelDepth: glyph.vowelDepth,
      codaDepth: glyph.codaDepth
    };

    if (glyph.sourceJamo) {
      copy.sourceJamo = {
        choseong: glyph.sourceJamo.choseong,
        jungseong: glyph.sourceJamo.jungseong,
        jongseong: glyph.sourceJamo.jongseong
      };
    }
    if (glyph.jamo) {
      copy.jamo = copyJamoTriple(glyph.jamo);
    }
    if (glyph.display) {
      copy.display = copyJamoTriple(glyph.display);
    }
    if (glyph.topology) {
      copy.topology = {
        jungLayout: glyph.topology.jungLayout,
        jongLayout: glyph.topology.jongLayout,
        placementKey: glyph.topology.placementKey,
        layoutBucket: glyph.topology.layoutBucket
      };
    }

    return copy;
  }

  function copyModel(model) {
    return {
      lines: model.lines.map(function (line) {
        return {
          type: line.type,
          index: line.index,
          children: line.children.map(function (child) {
            if (child.type === "word") {
              return {
                type: child.type,
                index: child.index,
                children: child.children.map(copyGlyph)
              };
            }
            return {
              type: child.type,
              index: child.index,
              raw: child.raw,
              count: child.count,
              kind: child.kind
            };
          })
        };
      })
    };
  }

  /* Bounded LRU access: reads refresh recency, writes evict the oldest key. */

  function cacheGet(cache, key) {
    if (!cache.has(key)) {
      return undefined;
    }
    var value = cache.get(key);
    cache.delete(key);
    cache.set(key, value);
    return value;
  }

  function cacheSet(cache, key, value, maxSize) {
    if (cache.has(key)) {
      cache.delete(key);
    } else if (cache.size >= maxSize) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(key, value);
  }

  function normalizeExpressionMode(value) {
    var normalized = String(value || "").trim().toLowerCase();
    if (normalized === "general" || normalized === "gothic") {
      return "general";
    }
    return DEFAULT_EXPRESSION_MODE;
  }

  /* Jamo depth is the decomposition axis and is independent of the expression
   * mode: expression mode declares the design (sebeol vs general), depth
   * declares how many nodes a cluster jamo becomes. Neither derives the other,
   * so any font may pick any combination. */
  function normalizeKeyword(value, allowed, fallback) {
    var normalized = String(value == null ? "" : value).trim().toLowerCase();
    return allowed[normalized] ? normalized : fallback;
  }

  /* 입력은 shorthand 문자열("atomic"|"composite"|"syllable") 또는
   * {vowel, coda} 객체를 받는다. 항상 정규화된 {vowel, coda}로 통일한다. */
  function normalizeDepthOptions(depth) {
    if (depth && typeof depth === "object") {
      return {
        vowel: normalizeKeyword(depth.vowel, VOWEL_DEPTHS, DEFAULT_VOWEL_DEPTH),
        coda: normalizeKeyword(depth.coda, CODA_DEPTHS, DEFAULT_CODA_DEPTH)
      };
    }
    var shorthand = JAMO_DEPTH_SHORTHANDS[String(depth == null ? "" : depth).trim().toLowerCase()];
    return shorthand
      ? { vowel: shorthand.vowel, coda: shorthand.coda }
      : { vowel: DEFAULT_VOWEL_DEPTH, coda: DEFAULT_CODA_DEPTH };
  }

  function depthCacheKey(options) {
    return options.vowel + "/" + options.coda;
  }

  function isHangulSyllable(char) {
    var code = char && char.codePointAt ? char.codePointAt(0) : undefined;
    return code !== undefined && code >= HANGUL_BASE && code <= HANGUL_END;
  }

  function classifyGlyphKind(char) {
    /* Only a grapheme that is exactly one precomposed syllable decomposes. A
     * syllable followed by further code points (가+U+0301, 한+U+302E 방점,
     * 각+U+11A8) is a non-Hangul glyph that keeps the whole cluster, so the
     * trailing marks are drawn instead of surviving only in data-source.
     * Like every multi-code-point cluster it is classified "symbol". */
    if (typeof char === "string" && char.length === 1 && isHangulSyllable(char)) {
      return "hangul";
    }

    if (/^[A-Za-z]$/u.test(char)) {
      return "latin";
    }

    if (/^\p{N}$/u.test(char)) {
      return "digit";
    }

    if (/^\p{P}$/u.test(char)) {
      return "punctuation";
    }

    return "symbol";
  }

  function resolveJungseong(jungseong, vowelDepth) {
    var split = HANGUL_TABLES.splitJungseong[jungseong];
    if (split) {
      if (vowelDepth === "whole") {
        /* The layout stays split-right: the cluster vowel still occupies the
         * bottom and the right band, it is simply drawn as one glyph. */
        return {
          source: jungseong,
          parts: [jungseong],
          display: [jungseong],
          layout: split.layout
        };
      }

      /* split과 syllable 모두 base/tail 분해가 필요하다 — syllable은 display
       * 단계에서 base를 초성과 합쳐 head로 만든다. */
      return {
        source: jungseong,
        parts: split.parts.slice(),
        display: split.display.slice(),
        layout: split.layout
      };
    }

    return {
      source: jungseong,
      parts: [jungseong],
      display: [jungseong],
      layout: HANGUL_TABLES.bottomJungseong[jungseong] ? "bottom" : "right"
    };
  }

  function resolveJongseong(jongseong, codaDepth) {
    if (!jongseong) {
      return {
        source: "",
        parts: [],
        display: [],
        layout: "none"
      };
    }

    if (HANGUL_TABLES.doubleJongseong[jongseong]) {
      var pair = HANGUL_TABLES.doubleJongseong[jongseong];
      if (codaDepth === "whole") {
        /* The layout stays double: the coda band still carries two consonants,
         * pre-shaped by the source font into one glyph. */
        return {
          source: jongseong,
          parts: [jongseong],
          display: [jongseong],
          layout: pair.layout
        };
      }

      return {
        source: jongseong,
        parts: pair.parts.slice(),
        display: pair.display.slice(),
        layout: pair.layout
      };
    }

    return {
      source: jongseong,
      parts: [jongseong],
      display: [jongseong],
      layout: "single"
    };
  }

  function resolveLayoutBucket(jung, jong) {
    var openness = jong.layout === "none" ? "open" : "closed";

    if (jung.layout === "right") {
      return "right-" + openness;
    }

    if (jung.layout === "bottom") {
      return "bottom-" + openness;
    }

    if (jung.layout === "split-right") {
      return "split-" + openness;
    }

    return "default";
  }

  function resolveSemanticAxis(jungLayout) {
    if (jungLayout === "split-right") {
      return "split";
    }
    return jungLayout || "default";
  }

  function resolveSemanticOpenState(jongLayout) {
    return jongLayout === "none" ? "open" : "closed";
  }

  function resolveSemanticFrame(glyph) {
    var topology = glyph && glyph.topology ? glyph.topology : {};
    return {
      axis: resolveSemanticAxis(topology.jungLayout),
      open: resolveSemanticOpenState(topology.jongLayout),
      jongCount: topology.jongLayout || "none"
    };
  }

  function applySemanticFrame(node, glyph, semanticRole) {
    if (!node) {
      return node;
    }

    var frame = resolveSemanticFrame(glyph);
    node.dataset.fyAxis = frame.axis;
    node.dataset.fyOpen = frame.open;
    node.dataset.fyJongCount = frame.jongCount;
    if (semanticRole) {
      node.dataset.fyRole = semanticRole;
    }
    return node;
  }

  function getPlacementKey(jungLayout, jongLayout) {
    return jungLayout + ":" + jongLayout;
  }

  /* split/whole render one node per (resolved) jamo. syllable folds the
   * choseong and the *base* of a split vowel into a precomposed syllable
   * ("과" → "고" + ㅏ); a syllable without a split vowel is untouched and keeps
   * its choseong node ("밟" → ㅂ + ㅏ + ㄼ). `head` lives on the display side,
   * not on the logical `jamo` triple: the source jamo are unchanged, only what
   * gets drawn differs. */
  function resolveDisplay(vowelDepth, choseongIndex, choseong, jung, jong) {
    var isSplitVowel = jung.parts.length > 1;
    if (vowelDepth !== "syllable" || !isSplitVowel) {
      return {
        choseong: [choseong],
        jungseong: jung.display.slice(),
        jongseong: jong.display.slice()
      };
    }

    var baseJungIndex = HANGUL_TABLES.jungseong.indexOf(jung.parts[0]);
    return {
      head: [composePartialSyllable(choseongIndex, baseJungIndex)],
      /* head는 완성형이라 자모 선택자가 없다 — base 모음을 별도 표면으로 노출해
       * CSS가 ㅜ계/ㅗ계 head를 분기할 수 있게 한다 (data-jamo-base). */
      headBase: jung.parts[0],
      choseong: [],
      jungseong: jung.parts.slice(1),
      jongseong: jong.display.slice()
    };
  }

  function decomposeGlyph(char, index, depth) {
    var glyphIndex = index || 0;
    var depthOptions = normalizeDepthOptions(depth);
    /* Depth changes the decomposition, so it has to be part of the cache
     * identity — otherwise the first depth to render a syllable would pin it. */
    var cacheKey = depthCacheKey(depthOptions) + " " + char;
    var cached = cacheGet(GLYPH_CACHE, cacheKey);
    if (cached) {
      var cachedCopy = copyGlyph(cached);
      cachedCopy.index = glyphIndex;
      return cachedCopy;
    }

    var kind = classifyGlyphKind(char);
    if (kind !== "hangul") {
      var plainGlyph = {
        type: "glyph",
        index: glyphIndex,
        source: char,
        kind: kind,
        vowelDepth: depthOptions.vowel,
        codaDepth: depthOptions.coda
      };
      cacheSet(GLYPH_CACHE, cacheKey, plainGlyph, GLYPH_CACHE_MAX);
      return copyGlyph(plainGlyph);
    }

    var syllableIndex = char.charCodeAt(0) - HANGUL_BASE;
    var choseongIndex = Math.floor(syllableIndex / (21 * 28));
    var jungseongIndex = Math.floor((syllableIndex % (21 * 28)) / 28);
    var jongseongIndex = syllableIndex % 28;

    var choseong = HANGUL_TABLES.choseong[choseongIndex];
    var jungseong = HANGUL_TABLES.jungseong[jungseongIndex];
    var jongseong = HANGUL_TABLES.jongseong[jongseongIndex];
    var jung = resolveJungseong(jungseong, depthOptions.vowel);
    var jong = resolveJongseong(jongseong, depthOptions.coda);
    var placementKey = getPlacementKey(jung.layout, jong.layout);
    var layoutBucket = resolveLayoutBucket(jung, jong);

    var glyph = {
      type: "glyph",
      index: glyphIndex,
      source: char,
      kind: kind,
      vowelDepth: depthOptions.vowel,
      codaDepth: depthOptions.coda,
      sourceJamo: {
        choseong: choseong,
        jungseong: jung.source,
        jongseong: jong.source
      },
      jamo: {
        choseong: [choseong],
        jungseong: jung.parts.slice(),
        jongseong: jong.parts.slice()
      },
      display: resolveDisplay(depthOptions.vowel, choseongIndex, choseong, jung, jong),
      topology: {
        jungLayout: jung.layout,
        jongLayout: jong.layout,
        placementKey: placementKey,
        layoutBucket: layoutBucket
      }
    };

    cacheSet(GLYPH_CACHE, cacheKey, glyph, GLYPH_CACHE_MAX);
    return copyGlyph(glyph);
  }

  function getSpaceKind(raw) {
    if (/^[ ]+$/u.test(raw)) {
      return "space";
    }
    if (/^\t+$/u.test(raw)) {
      return "tab";
    }
    if (/^\u00a0+$/u.test(raw)) {
      return "nbsp";
    }
    return "mixed";
  }

  function isInlineSpace(char) {
    return char === " " || char === "\t" || char === "\u00a0";
  }

  function createWord(chars, index, depth) {
    return {
      type: "word",
      index: index,
      children: chars.map(function (char, glyphIndex) {
        return decomposeGlyph(char, glyphIndex, depth);
      })
    };
  }

  function createSpace(raw, index) {
    return {
      type: "space",
      index: index,
      raw: raw,
      count: raw.length,
      kind: getSpaceKind(raw)
    };
  }

  var GRAPHEME_SEGMENTER = null;

  function segmentGraphemes(raw) {
    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
      if (!GRAPHEME_SEGMENTER) {
        GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });
      }
      return Array.from(GRAPHEME_SEGMENTER.segment(raw), function (entry) {
        return entry.segment;
      });
    }
    return Array.from(raw);
  }

  function segmentLine(raw, index, depth) {
    var children = [];
    var wordBuffer = [];
    var spaceBuffer = "";
    var childIndex = 0;

    function flushWord() {
      if (!wordBuffer.length) {
        return;
      }
      children.push(createWord(wordBuffer, childIndex, depth));
      childIndex += 1;
      wordBuffer = [];
    }

    function flushSpace() {
      if (!spaceBuffer) {
        return;
      }
      children.push(createSpace(spaceBuffer, childIndex));
      childIndex += 1;
      spaceBuffer = "";
    }

    segmentGraphemes(raw).forEach(function (char) {
      if (isInlineSpace(char)) {
        flushWord();
        spaceBuffer += char;
      } else {
        flushSpace();
        wordBuffer.push(char);
      }
    });

    flushWord();
    flushSpace();

    return {
      type: "line",
      index: index,
      children: children
    };
  }

  function cacheModel(key, model, chars) {
    if (chars > MODEL_CACHE_ENTRY_MAX_CHARS) {
      return;
    }
    if (MODEL_CACHE.has(key)) {
      modelCacheChars -= MODEL_CACHE.get(key).chars;
      MODEL_CACHE.delete(key);
    }
    while (MODEL_CACHE.size && (MODEL_CACHE.size >= MODEL_CACHE_MAX ||
        modelCacheChars + chars > MODEL_CACHE_MAX_CHARS)) {
      var oldest = MODEL_CACHE.keys().next().value;
      modelCacheChars -= MODEL_CACHE.get(oldest).chars;
      MODEL_CACHE.delete(oldest);
    }
    MODEL_CACHE.set(key, { model: model, chars: chars });
    modelCacheChars += chars;
  }

  /* Internal: returns the (possibly cached) model itself. Render paths only
   * read it, so they skip the defensive copy that public callers get. */
  function buildTextModel(text, depth) {
    var normalized = String(text == null ? "" : text);
    if (typeof String.prototype.normalize === "function") {
      normalized = normalized.normalize("NFC");
    }
    normalized = normalized.replace(/\r\n?/gu, "\n");

    var depthOptions = normalizeDepthOptions(depth);
    var cacheKey = depthCacheKey(depthOptions) + " " + normalized;
    var cached = cacheGet(MODEL_CACHE, cacheKey);
    if (cached) {
      return cached.model;
    }

    var model = {
      lines: normalized.split("\n").map(function (line, index) {
        return segmentLine(line, index, depthOptions);
      })
    };

    cacheModel(cacheKey, model, normalized.length);
    return model;
  }

  function createTextModel(text, depth) {
    return copyModel(buildTextModel(text, depth));
  }

  /* The document the current render builds nodes in (the host's own
   * document, so hosts inside iframes get nodes of their realm). */
  var renderDocument = null;

  /* Whether the host being rendered paints jamo from a sprite sheet. Only then
   * does a standalone jamo (ㅋ, a composing ㄱ — a non-Hangul glyph) get the
   * sprite surface, so system-material DOM (and the sidecar contract,
   * spec/html-cases.json) is unchanged. */
  var renderSpriteMaterial = false;

  function createSpan(part, text) {
    var node = (renderDocument || document).createElement("span");
    node.setAttribute("part", part);
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function createClusterNode(part, glyph, role) {
    var node = createSpan("cluster " + part);
    node.dataset.jamoRole = role + "-cluster";
    if (glyph.topology) {
      node.dataset.layoutKey = glyph.topology.placementKey;
      node.dataset.fyLayoutBucket = glyph.topology.layoutBucket || "default";
    }
    return applySemanticFrame(node, glyph, role === "jungseong" ? "jung-cluster" : "jong-cluster");
  }

  function createGlyphBodyNode(glyph) {
    var node = createSpan("glyph-body");
    if (glyph.topology) {
      node.dataset.jungLayout = glyph.topology.jungLayout;
      node.dataset.jongLayout = glyph.topology.jongLayout;
      node.dataset.layoutKey = glyph.topology.placementKey;
      node.dataset.fyLayoutBucket = glyph.topology.layoutBucket || "default";
    }
    return applySemanticFrame(node, glyph);
  }

  function resolveJamoIndex(value, role) {
    if (role === "choseong") return HANGUL_TABLES.choseong.indexOf(value);
    if (role === "jungseong") return HANGUL_TABLES.jungseong.indexOf(value);
    if (role === "jongseong") return HANGUL_TABLES.jongseong.indexOf(value);
    return -1;
  }

  function resolveSpriteJamo(value) {
    var compat = JAMO_TO_COMPAT[value] || value;
    var consonantIndex = SPRITE_JAMO_TABLES.consonant.indexOf(compat);
    if (consonantIndex >= 0) {
      return { value: compat, kind: "consonant", index: consonantIndex };
    }

    var vowelIndex = SPRITE_JAMO_TABLES.vowel.indexOf(compat);
    if (vowelIndex >= 0) {
      return { value: compat, kind: "vowel", index: vowelIndex };
    }

    var clusterIndex = SPRITE_JAMO_TABLES.codaCluster.indexOf(compat);
    if (clusterIndex >= 0) {
      return { value: compat, kind: "coda-cluster", index: clusterIndex };
    }

    return null;
  }

  function createJamoNode(part, value, role, pos, glyph, semanticRole) {
    var node = createSpan(part, value);
    node.dataset.jamo = value;
    node.dataset.jamoRole = role;
    node.dataset.fyPos = pos;
    var jamoIndex = resolveJamoIndex(value, role);
    if (jamoIndex >= 0) {
      node.dataset.jamoIndex = String(jamoIndex);
      node.style.setProperty("--fy-jamo-index", String(jamoIndex));
    }
    stampSpriteJamo(node, value);
    return applySemanticFrame(node, glyph, semanticRole);
  }

  function stampSpriteJamo(node, value) {
    var spriteJamo = resolveSpriteJamo(value);
    if (spriteJamo) {
      node.dataset.spriteJamo = spriteJamo.value;
      node.dataset.spriteJamoKind = spriteJamo.kind;
      node.dataset.spriteJamoIndex = String(spriteJamo.index);
      node.style.setProperty("--fy-sprite-jamo-index", String(spriteJamo.index));
    }
    return spriteJamo;
  }

  function renderHangulGlyph(glyph, glyphIndex) {
    var node = createSpan("glyph");
    var body = createGlyphBodyNode(glyph);
    var placements = resolvePlacementPlan(glyph);
    node.dataset.glyphKind = glyph.kind;
    node.dataset.hangul = "true";
    node.dataset.glyphIndex = String(glyphIndex);
    node.dataset.source = glyph.source;
    node.style.setProperty("--fy-glyph-index", String(glyphIndex));

    if (glyph.topology) {
      node.dataset.jungLayout = glyph.topology.jungLayout;
      node.dataset.jongLayout = glyph.topology.jongLayout;
      node.dataset.layoutKey = glyph.topology.placementKey;
      node.dataset.fyLayoutBucket = glyph.topology.layoutBucket || "default";
    }
    applySemanticFrame(node, glyph);

    (glyph.display.head || []).forEach(function (value, index) {
      var child = createJamoNode(
        "jamo head",
        value,
        "head",
        (placements.head || [])[index] || "h",
        glyph,
        "head"
      );
      if (glyph.display.headBase) {
        child.dataset.jamoBase = glyph.display.headBase;
      }
      body.appendChild(child);
    });

    (glyph.display.choseong || []).forEach(function (value, index) {
      var child = createJamoNode(
        "jamo choseong",
        value,
        "choseong",
        placements.choseong[index] || "tl",
        glyph,
        "choseong"
      );
      body.appendChild(child);
    });

    if ((glyph.display.jungseong || []).length > 1) {
      var jungCluster = createClusterNode(
        "jungseong-cluster",
        glyph,
        "jungseong"
      );

      (glyph.display.jungseong || []).forEach(function (value, index) {
        var part = index === 0
          ? "jamo jungseong jungseong-base"
          : "jamo jungseong jungseong-tail";
        var child = createJamoNode(
          part,
          value,
          "jungseong",
          placements.jungseong[index] || "tr",
          glyph,
          index === 0 ? "jung-base" : "jung-tail"
        );
        jungCluster.appendChild(child);
      });

      body.appendChild(jungCluster);
    } else {
      /* 단일 중성이라도 head 옆의 tail은 의미상 tail이다 — role-tier 폰트의
       * --fy-jung-tail-*과 [part~="jungseong-tail"] 스타일이 vowel-depth와
       * 무관하게 같은 표면을 유지해야 한다. */
      var hasHead = (glyph.display.head || []).length > 0;
      (glyph.display.jungseong || []).forEach(function (value, index) {
        var child = createJamoNode(
          hasHead ? "jamo jungseong jungseong-tail" : "jamo jungseong",
          value,
          "jungseong",
          placements.jungseong[index] || "tr",
          glyph,
          hasHead ? "jung-tail" : "jung-main"
        );
        body.appendChild(child);
      });
    }

    if ((glyph.display.jongseong || []).length > 1) {
      var jongCluster = createClusterNode(
        "jongseong-cluster",
        glyph,
        "jongseong"
      );

      (glyph.display.jongseong || []).forEach(function (value, index) {
        var part = index === 0
          ? "jamo jongseong jongseong-left"
          : "jamo jongseong jongseong-right";
        var child = createJamoNode(
          part,
          value,
          "jongseong",
          placements.jongseong[index] || "br",
          glyph,
          index === 0 ? "jong-left" : "jong-right"
        );
        jongCluster.appendChild(child);
      });

      body.appendChild(jongCluster);
    } else {
      (glyph.display.jongseong || []).forEach(function (value, index) {
        var child = createJamoNode(
          "jamo jongseong",
          value,
          "jongseong",
          placements.jongseong[index] || "br",
          glyph,
          "jong-main"
        );
        body.appendChild(child);
      });
    }

    node.appendChild(body);
    return node;
  }

  function renderPlainGlyph(glyph, glyphIndex) {
    var node = createSpan("glyph");
    node.dataset.glyphKind = glyph.kind;
    node.dataset.hangul = "false";
    node.dataset.glyphIndex = String(glyphIndex);
    node.dataset.source = glyph.source;
    node.style.setProperty("--fy-glyph-index", String(glyphIndex));
    var content = createSpan("content", glyph.source);
    /* A lone jamo (compatibility ㄱ or a conjoining jamo by itself) has a cell
     * in the sheet: in a sprite host it carries the same data-sprite-jamo*
     * surface as a jamo node, so the core sprite rule paints the cell instead
     * of a system-font glyph (which is tofu on a device without Hangul). */
    if (renderSpriteMaterial && glyph.source.length === 1) {
      stampSpriteJamo(content, glyph.source);
    }
    node.appendChild(content);
    return node;
  }

  function resolvePlacementPlan(glyph) {
    var key = glyph.topology && glyph.topology.placementKey
      ? glyph.topology.placementKey
      : "right:none";
    var vowelTables = PLACEMENT_TABLES_BY_COMBO[glyph.vowelDepth] ||
      PLACEMENT_TABLES_BY_COMBO[DEFAULT_VOWEL_DEPTH];
    var table = vowelTables[glyph.codaDepth] || vowelTables[DEFAULT_CODA_DEPTH];

    return table[key] || table["right:none"];
  }

  function renderGlyph(glyph, glyphIndex) {
    return glyph.kind === "hangul"
      ? renderHangulGlyph(glyph, glyphIndex)
      : renderPlainGlyph(glyph, glyphIndex);
  }

  function renderTextModel(text, depth) {
    var root = createSpan("root");
    var model = buildTextModel(text, depth);
    var glyphIndex = 0;

    model.lines.forEach(function (line) {
      var lineNode = createSpan("line");
      lineNode.dataset.lineIndex = String(line.index);
      lineNode.style.setProperty("--fy-line-index", String(line.index));

      if (!line.children.length) {
        lineNode.dataset.empty = "true";
      }

      line.children.forEach(function (child) {
        if (child.type === "word") {
          var wordNode = createSpan("word");
          wordNode.dataset.wordIndex = String(child.index);
          wordNode.style.setProperty("--fy-word-index", String(child.index));

          child.children.forEach(function (glyph) {
            wordNode.appendChild(renderGlyph(glyph, glyphIndex));
            glyphIndex += 1;
          });

          lineNode.appendChild(wordNode);
          return;
        }

        var spaceNode = createSpan("space");
        spaceNode.dataset.spaceKind = child.kind;
        spaceNode.style.setProperty("--fy-space-count", String(child.count));
        lineNode.appendChild(spaceNode);
      });

      root.appendChild(lineNode);
    });

    return root;
  }

  function normalizeLength(value, fallback) {
    if (value === undefined || value === null) {
      return fallback;
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value + "px" : fallback;
    }
    var str = String(value).trim();
    if (!str) {
      return fallback;
    }
    if (/^\d+(\.\d+)?$/u.test(str)) {
      return str + "px";
    }
    return str;
  }

  /* Node type checks instead of `instanceof HTMLElement`: hosts in a
   * same-origin iframe belong to another realm and fail instanceof. */
  function isElementNode(node) {
    return Boolean(node) && node.nodeType === 1;
  }

  function inferHostMode(target) {
    return String(target.localName || target.tagName || "").toLowerCase() === "font-kku"
      ? "custom-element"
      : "decorator";
  }

  /* Persistent option inputs (ADR-002): a custom element reads the plain
   * attribute, a decorator the data-* attribute of the same name. */
  var OPTION_KEYS = ["font", "profile", "size", "spacing", "wrap-unit", "animate", "seed", "jamo-seeds", "jamo-set"];
  var DECORATOR_OPTION_ATTRIBUTES = OPTION_KEYS.map(function (key) {
    return "data-" + key;
  });
  var DATASET_KEYS = {
    "font": "font",
    "profile": "profile",
    "size": "size",
    "spacing": "spacing",
    "wrap-unit": "wrapUnit",
    "animate": "animate",
    "seed": "seed",
    "jamo-seeds": "jamoSeeds",
    "jamo-set": "jamoSet"
  };

  function readRawOption(host, mode, key) {
    if (mode === "custom-element") {
      return host.getAttribute(key);
    }
    var value = host.dataset ? host.dataset[DATASET_KEYS[key]] : undefined;
    return value === undefined ? null : value;
  }

  function readOption(host, mode, key) {
    if (key === "font" || key === "profile") {
      return readRawOption(host, mode, "font") || readRawOption(host, mode, "profile") || null;
    }
    var value = readRawOption(host, mode, key);
    /* jamo-seeds is a boolean attribute: presence (even empty) matters. */
    return key === "jamo-seeds" ? value : value || null;
  }

  /* Raw option inputs as one comparable string. A re-render is due only
   * when this differs from the inputs of the last render — setting an
   * attribute to its current value, or the attribute callbacks a custom
   * element upgrade replays, never re-render. */
  function snapshotOptions(host, mode) {
    return OPTION_KEYS.map(function (key) {
      var value = readRawOption(host, mode, key);
      return value === null ? "\u0000" : value;
    }).join("\u0001");
  }

  function resolveSeed(value) {
    if (value === undefined || value === null || value === "") {
      return null;
    }
    var str = String(value).trim();
    if (str === "auto" || str === "random") {
      return Math.random();
    }
    var num = Number(str);
    if (Number.isFinite(num)) {
      return num;
    }
    return hashSeed(str);
  }

  /* Font names and aliases are trimmed and ASCII-case-insensitive; the
   * canonical name is lowercase ("SEBUL" -> "sebul", "Gothic2" -> "gothic"),
   * unknown names included, so a [data-fy-font="x"] gate is predictable.
   * Deprecated alias names resolve to their shipped font. Author input stays
   * untouched; the resolved data-fy-* surface is normalized instead. */
  function foldFontName(value) {
    return String(value == null ? "" : value).trim().replace(/[A-Z]+/g, function (letters) {
      return letters.toLowerCase();
    });
  }

  function normalizeFontName(value) {
    var name = foldFontName(value);
    if (!name) {
      return DEFAULT_FONT;
    }
    return Object.prototype.hasOwnProperty.call(FONT_ALIASES, name) ? FONT_ALIASES[name] : name;
  }

  /* An empty JS option (undefined, null, "") falls back to the attribute. */
  function isBlank(value) {
    return value === undefined || value === null || value === "";
  }

  var JAMO_SEEDS_OFF = { "false": true, "off": true, "none": true, "0": true };

  /* Opt-in per-render jamo seeding. The attribute is boolean ("false",
   * "off", "none", "0" turn it off); the JS option also accepts
   * applyJamoSeeds options ({ property, salt, hash }). */
  function normalizeJamoSeeds(value) {
    if (value === undefined || value === null || value === false) {
      return null;
    }
    if (value === true) {
      return {};
    }
    if (typeof value === "object") {
      return value;
    }
    return JAMO_SEEDS_OFF[String(value).trim().toLowerCase()] ? null : {};
  }

  /* ADR-002: attributes are the persistent source, JS options apply to this
   * call only. `previous` is passed by style re-resolution: it keeps the seed
   * its unchanged attribute input resolved to, so seed="auto" does not
   * re-roll because a stylesheet arrived. A seed from a one-shot JS option is
   * not kept. */
  function normalizeOptions(host, mode, options, previous) {
    var next = options || {};
    var seedFromOption = !isBlank(next.seed);
    var seedInput = seedFromOption ? next.seed : readOption(host, mode, "seed");
    var keepSeed = previous && !seedFromOption && previous.seedFromAttribute &&
      previous.seedInput === seedInput;
    var spacing = normalizeLength(
      isBlank(next.spacing) ? readOption(host, mode, "spacing") : next.spacing, "");

    return {
      font: normalizeFontName(next.font || next.profile || readOption(host, mode, "font") || DEFAULT_FONT),
      size: normalizeLength(isBlank(next.size) ? readOption(host, mode, "size") : next.size, "24px"),
      spacing: spacing || undefined,
      wrapUnit: next.wrapUnit || readOption(host, mode, "wrap-unit") || "word",
      animate: next.animate || readOption(host, mode, "animate") || undefined,
      seed: keepSeed ? previous.seed : resolveSeed(seedInput),
      seedInput: seedInput === undefined ? null : seedInput,
      seedFromAttribute: !seedFromOption,
      jamoSeeds: normalizeJamoSeeds(
        isBlank(next.jamoSeeds) ? readOption(host, mode, "jamo-seeds") : next.jamoSeeds),
      jamoSet: normalizeJamoSetName(isBlank(next.jamoSet) ? readOption(host, mode, "jamo-set") : next.jamoSet),
      hostMode: mode
    };
  }

  function setDataIfChanged(host, key, value) {
    if (host.dataset[key] !== value) {
      host.dataset[key] = value;
    }
  }

  function setResolvedFontSurface(host, font, hostMode) {
    setDataIfChanged(host, "fyFont", font);
    setDataIfChanged(host, "fyProfile", font);

    /* A custom element reads plain attributes (`font`/`profile`), so its
     * historical normalized data-* output remains unambiguous and compatible.
     * A decorator reads data-* as author input and must never overwrite it. */
    if (hostMode === "custom-element") {
      setDataIfChanged(host, "font", font);
      setDataIfChanged(host, "profile", font);
    }
  }

  function readIdent(style, name) {
    return String(style.getPropertyValue(name) || "").trim().replace(/^["']|["']$/g, "");
  }

  function computedStyleFor(host) {
    var view = host.ownerDocument && host.ownerDocument.defaultView;
    if (view && typeof view.getComputedStyle === "function") {
      return view.getComputedStyle(host);
    }
    return getComputedStyle(host);
  }

  /* Everything the runtime reads from font CSS, in one computed-style pass.
   * Call only after the font surface has been stamped: profile CSS gates on
   * data-fy-font, so reading earlier would resolve against the previous font.
   * - structure: --fy-expression-mode and the jamo depth — font level
   *   --fy-font-jamo-depth (shorthand) / --fy-font-vowel-depth /
   *   --fy-font-coda-depth, page level the same names without "font-"
   *   (page beats font; within a level a declared longhand wins)
   * - metadata (ADR-008): --fy-font-id tells whether the requested font's CSS
   *   has arrived, --fy-contract which contract it targets, --fy-material and
   *   --fy-sprite-kinds gate the core sprite painting. Keywords are
   *   case-insensitive like the depth keywords. */
  /* Jamo depth at one level: the plain names are the page level, the
   * --fy-font-* names the font level (like --fy-weight / --fy-font-weight).
   * Within a level a declared longhand wins over the shorthand. */
  var PAGE_DEPTH_VARIABLES = { shorthand: "--fy-jamo-depth", vowel: "--fy-vowel-depth", coda: "--fy-coda-depth" };
  var FONT_DEPTH_VARIABLES = { shorthand: "--fy-font-jamo-depth", vowel: "--fy-font-vowel-depth", coda: "--fy-font-coda-depth" };

  function readDepthLevel(style, names) {
    var shorthand = JAMO_DEPTH_SHORTHANDS[
      String(style.getPropertyValue(names.shorthand) || "").trim().toLowerCase()
    ];
    return {
      vowel: normalizeKeyword(style.getPropertyValue(names.vowel), VOWEL_DEPTHS, shorthand ? shorthand.vowel : null),
      coda: normalizeKeyword(style.getPropertyValue(names.coda), CODA_DEPTHS, shorthand ? shorthand.coda : null)
    };
  }

  function readHostStyle(host, font) {
    var style = computedStyleFor(host);
    /* page longhand ?? page shorthand ?? font longhand ?? font shorthand ?? 기본값
     * — 페이지가 폰트의 depth를 항상 이긴다(ADR-008 §1 page 레벨). */
    var pageDepth = readDepthLevel(style, PAGE_DEPTH_VARIABLES);
    var fontDepth = readDepthLevel(style, FONT_DEPTH_VARIABLES);
    var contract = parseInt(readIdent(style, "--fy-contract"), 10);
    var meta = {
      id: readIdent(style, "--fy-font-id"),
      contract: isNaN(contract) ? null : contract,
      material: readIdent(style, "--fy-material").toLowerCase() || "system",
      spriteKinds: "",
      spritePaint: ""
    };
    if (meta.material === "sprite") {
      /* 시트에 칸이 있는 자모 종류. 코어 sprite 재료 규칙이 이 목록으로 게이트해,
       * 칸이 없는 종류(예: 2행 시트의 겹받침)는 원본 글자로 폴백된다. */
      meta.spriteKinds = readIdent(style, "--fy-sprite-kinds").toLowerCase().split(/\s+/).filter(function (kind) {
        return kind === "consonant" || kind === "vowel" || kind === "coda-cluster";
      }).join(" ");
      /* 마스크 칠: 자소판을 마스크로 쓰고 칠은 CSS(--fy-sprite-fill, 기본 글자 색)로. */
      meta.spritePaint = readIdent(style, "--fy-sprite-paint").toLowerCase() === "mask" ? "mask" : "";
    }
    if (meta.contract !== null && meta.contract > SUPPORTED_FONT_CONTRACT && !CONTRACT_WARNINGS[font]) {
      CONTRACT_WARNINGS[font] = true;
      if (typeof console !== "undefined" && console.warn) {
        console.warn("font-kku: font \"" + font + "\" targets contract " + meta.contract +
          " but this runtime supports " + SUPPORTED_FONT_CONTRACT);
      }
    }
    return {
      expressionMode: normalizeExpressionMode(style.getPropertyValue("--fy-expression-mode")),
      depthOptions: {
        vowel: pageDepth.vowel || fontDepth.vowel || DEFAULT_VOWEL_DEPTH,
        coda: pageDepth.coda || fontDepth.coda || DEFAULT_CODA_DEPTH
      },
      fontMeta: meta,
      resolved: host.isConnected === true
    };
  }

  /* Values that change the generated DOM. Font id/contract only feed
   * fontInfo(), so a change there updates state without a rebuild. */
  function sameStructure(style, options) {
    return style.expressionMode === options.expressionMode &&
      style.depthOptions.vowel === options.depthOptions.vowel &&
      style.depthOptions.coda === options.depthOptions.coda &&
      style.fontMeta.material === options.fontMeta.material &&
      style.fontMeta.spriteKinds === options.fontMeta.spriteKinds &&
      (style.fontMeta.spritePaint || "") === (options.fontMeta.spritePaint || "");
  }

  function getManagedRoot(host) {
    var children = host.children || [];
    for (var i = 0; i < children.length; i += 1) {
      var child = children[i];
      if (isElementNode(child) && child.dataset && child.dataset.fyRoot === "true") {
        return child;
      }
    }
    return null;
  }

  function getSrSourceNode(host) {
    var children = host.children || [];
    for (var i = 0; i < children.length; i += 1) {
      var child = children[i];
      if (isElementNode(child) && child.dataset && child.dataset.fySr === "true") {
        return child;
      }
    }
    return null;
  }

  /* The source text the host's children currently stand for.
   * - no managed root: the children were replaced wholesale → textContent
   * - managed root: the recorded source (runtime state, else data-source,
   *   else the sr-source mirror for a clone or SSR tree without state) —
   *   never the decomposed jamo text. Text or element children added beside
   *   the root and sr-source nodes (host.append("…"), text the HTML parser
   *   delivers after an early upgrade) are new input and join the source in
   *   document order. */
  function readLiveSource(host, state) {
    var root = getManagedRoot(host);
    if (!root) {
      return host.textContent || "";
    }
    var srNode = getSrSourceNode(host);
    var base;
    if (state) {
      base = state.source;
    } else if (host.dataset && host.dataset.source !== undefined) {
      base = host.dataset.source;
    } else {
      base = srNode ? srNode.textContent || "" : "";
    }

    var nodes = host.childNodes || host.children || [];
    var before = "";
    var after = "";
    var seenManaged = false;
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (node === root || node === srNode) {
        seenManaged = true;
        continue;
      }
      if (node.nodeType !== 1 && node.nodeType !== 3) {
        continue;
      }
      if (seenManaged) {
        after += node.textContent || "";
      } else {
        before += node.textContent || "";
      }
    }
    return before + base + after;
  }

  function setHostContract(host, source, options) {
    host.dataset.fyUpgraded = "true";
    host.dataset.fyHost = options.hostMode;
    host.dataset.fyExpression = options.expressionMode;
    var depthOptions = options.depthOptions ||
      { vowel: DEFAULT_VOWEL_DEPTH, coda: DEFAULT_CODA_DEPTH };
    host.dataset.fyVowelDepth = depthOptions.vowel;
    host.dataset.fyCodaDepth = depthOptions.coda;
    setResolvedFontSurface(host, options.font, options.hostMode);
    /* 재료 표면은 system이 아닐 때만 찍는다 — system 폰트(사이드카가 렌더하는
     * sebul/gothic)의 DOM 계약은 그대로다. */
    var fontMeta = options.fontMeta || { material: "system", spriteKinds: "" };
    /* 벡터 자소(ADR-013): 등록된 자모 세트가 있으면 그림 자소 배치 폰트를 자소판 대신
     * 자모별 SVG로 그린다 — 재료 표면을 vector로 바꿔 코어 sprite 규칙을 끈다. */
    var vectorSet = vectorSetFor(options);
    if (vectorSet) {
      host.dataset.fyMaterial = "vector";
      host.dataset.fyJamoSet = vectorSet.name;
    } else if (fontMeta.material !== "system") {
      host.dataset.fyMaterial = fontMeta.material;
    } else {
      delete host.dataset.fyMaterial;
    }
    if (!vectorSet) {
      delete host.dataset.fyJamoSet;
    }
    if (!vectorSet && fontMeta.spritePaint === "mask") {
      host.dataset.fySpritePaint = "mask";
    } else {
      delete host.dataset.fySpritePaint;
    }
    if (fontMeta.spriteKinds) {
      host.dataset.fySpriteKinds = fontMeta.spriteKinds;
    } else {
      delete host.dataset.fySpriteKinds;
    }
    host.dataset.fySize = options.size;
    host.dataset.fyWrapUnit = options.wrapUnit;

    if (options.spacing) {
      host.dataset.fySpacing = options.spacing;
    } else {
      delete host.dataset.fySpacing;
    }

    if (options.animate) {
      host.dataset.fyAnimate = options.animate;
    } else {
      delete host.dataset.fyAnimate;
    }

    /* Opt-in browser-only surface: absent unless jamo seeding is enabled, so
     * the default DOM contract (spec/html-cases.json) is unchanged. */
    if (options.jamoSeeds) {
      host.dataset.fyJamoSeeds = "true";
    } else {
      delete host.dataset.fyJamoSeeds;
    }

    if (options.hostMode === "custom-element") {
      host.dataset.size = options.size;
      host.dataset.wrapUnit = options.wrapUnit;
      if (options.animate) {
        host.dataset.animate = options.animate;
      } else {
        delete host.dataset.animate;
      }
    }

    host.style.setProperty("--fy-size", options.size);
    if (options.spacing) {
      host.style.setProperty("--fy-space-width", options.spacing);
      host.style.setProperty("--fy-word-gap", options.spacing);
    } else {
      host.style.removeProperty("--fy-space-width");
      host.style.removeProperty("--fy-word-gap");
    }

    if (options.seed !== null && options.seed !== undefined) {
      host.style.setProperty("--fy-seed", String(options.seed));
      host.dataset.fySeed = String(options.seed);
      if (options.hostMode === "custom-element") {
        host.dataset.seed = String(options.seed);
      }
    } else {
      host.style.removeProperty("--fy-seed");
      delete host.dataset.fySeed;
      if (options.hostMode === "custom-element") {
        delete host.dataset.seed;
      }
    }

    host.dataset.source = source;
    /* aria-label/data-source stay for compatibility; the primary
     * accessibility surface is the visually-hidden [part="sr-source"] node.
     * role="text" is non-standard and is intentionally not set anymore. */
    host.setAttribute("aria-label", source);
  }

  // ── Render pipeline ────────────────────────────────────────

  /* Every render — explicit or automatic — is a job:
   *   reason   why it runs; reported by the `font-kku:render` event
   *   options  normalized options (ADR-002)
   *   source   the text to render
   *   style    font style resolution (readHostStyle); null until resolved */
  function createRenderJob(host, options, reason, extra) {
    var state = STATE.get(host);
    var mode = inferHostMode(host);
    var text = options ? options.text : undefined;
    var job = {
      host: host,
      reason: reason,
      options: normalizeOptions(host, mode, options,
        extra && extra.keepSeed && state ? state.options : null),
      source: text === undefined || text === null ? readLiveSource(host, state) : String(text),
      style: null
    };
    if (extra && extra.style && state && job.options.font === state.options.font) {
      job.style = extra.style;
    }
    return job;
  }

  /* A detached host has no computed style: every font variable reads empty,
   * which would freeze the default structure. Keep what the host already
   * resolved for the same font (a recycled row keeps its shape) and mark the
   * render unresolved; it is verified when the host is connected. */
  function resolveJobStyle(job) {
    var previous = STATE.get(job.host);
    if (!job.host.isConnected && previous && previous.options.font === job.options.font) {
      return {
        expressionMode: previous.options.expressionMode,
        depthOptions: previous.options.depthOptions,
        fontMeta: previous.options.fontMeta,
        resolved: false
      };
    }
    return readHostStyle(job.host, job.options.font);
  }

  /* Batched: stamp every host's font surface, then read every host's style,
   * then build and write. Reading between writes would force one style
   * recalculation per host (each including the previous host's new jamo
   * tree); this order needs one. Render events fire after all writes so a
   * listener never sees a half-applied batch. */
  function runRenderJobs(jobs) {
    jobs.forEach(function (job) {
      if (!job.style) {
        setResolvedFontSurface(job.host, job.options.font, job.options.hostMode);
      }
    });
    jobs.forEach(function (job) {
      if (!job.style) {
        job.style = resolveJobStyle(job);
      }
    });
    jobs.forEach(commitRenderJob);
    paintVectorJamo(jobs.map(function (job) {
      return job.host;
    }));
    jobs.forEach(function (job) {
      dispatchRender(job.host, job.reason);
    });
    return jobs.map(function (job) {
      return job.host;
    });
  }

  function commitRenderJob(job) {
    var host = job.host;
    var previous = STATE.get(host);
    if (previous && previous.observer) {
      previous.observer.disconnect();
      previous.observer = undefined;
    }

    var style = job.style;
    var options = Object.assign({}, job.options, {
      expressionMode: style.expressionMode,
      depthOptions: style.depthOptions,
      fontMeta: style.fontMeta
    });

    /* The tree is built detached and swapped in with one replaceChildren. */
    var outerDocument = renderDocument;
    var outerSprite = renderSpriteMaterial;
    renderDocument = host.ownerDocument || null;
    renderSpriteMaterial = Boolean(options.fontMeta) && options.fontMeta.material === "sprite";
    var root;
    var srNode;
    try {
      root = renderTextModel(job.source, options.depthOptions);
      srNode = createSpan("sr-source", job.source);
    } finally {
      renderDocument = outerDocument;
      renderSpriteMaterial = outerSprite;
    }
    root.dataset.fyRoot = "true";
    root.setAttribute("aria-hidden", "true");
    srNode.dataset.fySr = "true";

    setHostContract(host, job.source, options);
    host.replaceChildren(root, srNode);

    var state = {
      source: job.source,
      options: options,
      hostMode: options.hostMode,
      snapshot: snapshotOptions(host, options.hostMode),
      unresolved: !style.resolved,
      observer: undefined
    };
    STATE.set(host, state);

    if (options.jamoSeeds) {
      applyJamoSeeds(host, options.jamoSeeds);
    }
    observeHost(host, state);
    registerHost(host);
    if (state.unresolved) {
      trackPending(host);
    } else {
      untrackPending(host);
    }
    return state;
  }

  var RENDER_EVENT = "font-kku:render";

  /* Automatic re-renders rebuild the managed DOM and drop whatever page code
   * wrote into it. This event (bubbles, composed) tells the page every time,
   * with the reason: render | refresh | upgrade | connect | attribute |
   * mutation | restyle. */
  function dispatchRender(host, reason) {
    var state = STATE.get(host);
    if (!state || typeof host.dispatchEvent !== "function") {
      return;
    }
    var view = host.ownerDocument && host.ownerDocument.defaultView;
    var EventCtor = (view && view.CustomEvent) ||
      (typeof CustomEvent === "function" ? CustomEvent : null);
    if (!EventCtor) {
      return;
    }
    host.dispatchEvent(new EventCtor(RENDER_EVENT, {
      bubbles: true,
      composed: true,
      detail: {
        reason: reason,
        font: state.options.font,
        source: state.source,
        resolved: !state.unresolved
      }
    }));
  }

  function rerender(host, reason, text) {
    return runRenderJobs([
      createRenderJob(host, text === undefined ? undefined : { text: text }, reason)
    ])[0];
  }

  // ── Change detection ───────────────────────────────────────

  var CUSTOM_ELEMENT_CLASS = null;

  function isOwnCustomElement(host) {
    return CUSTOM_ELEMENT_CLASS !== null && host instanceof CUSTOM_ELEMENT_CLASS;
  }

  /* childList/characterData catch source edits. Option attributes are
   * watched here for decorators (and for <font-kku> hosts this runtime did
   * not upgrade, e.g. inside an iframe); the custom element class handles its
   * own through attributeChangedCallback. Only the host's own attributes
   * count — page code writing data-* onto generated jamo nodes is not an
   * option change. */
  function observeHost(host, state) {
    if (typeof MutationObserver !== "function") {
      return;
    }
    if (state.observer) {
      state.observer.disconnect();
    }
    var config = { childList: true, subtree: true, characterData: true };
    if (state.hostMode === "decorator") {
      config.attributes = true;
      config.attributeFilter = DECORATOR_OPTION_ATTRIBUTES;
    } else if (!isOwnCustomElement(host)) {
      config.attributes = true;
      config.attributeFilter = OPTION_KEYS;
    }
    var observer = new MutationObserver(function (mutations) {
      handleHostMutations(host, mutations, observer);
    });
    observer.observe(host, config);
    state.observer = observer;
  }

  function handleHostMutations(host, mutations, observer) {
    var state = STATE.get(host);
    if (!state || state.observer !== observer) {
      return;
    }
    var optionTouched = mutations.some(function (mutation) {
      return mutation.type === "attributes" && mutation.target === host;
    });
    if (optionTouched && snapshotOptions(host, state.hostMode) !== state.snapshot) {
      rerender(host, "attribute");
      return;
    }
    var liveSource = readLiveSource(host, state);
    if (liveSource !== state.source) {
      rerender(host, "mutation", liveSource);
    }
  }

  /* Compare a fresh style resolution with the last render.
   * Returns false (unchanged), true (only fontInfo metadata changed; state
   * updated in place, no rebuild) or a render job to run. */
  function reconcileHostStyle(host, state, style, reason) {
    var wasUnresolved = state.unresolved;
    state.unresolved = false;
    untrackPending(host);
    registerHost(host);
    var options = state.options;
    if (sameStructure(style, options)) {
      if (style.fontMeta.id !== options.fontMeta.id ||
          style.fontMeta.contract !== options.fontMeta.contract) {
        options.fontMeta = style.fontMeta;
        return true;
      }
      return false;
    }
    if (wasUnresolved) {
      /* The last render ran detached, so its style was never resolved:
       * finish that same call, JS options included. */
      return {
        host: host,
        reason: reason,
        options: options,
        source: state.source,
        style: style
      };
    }
    /* A style change is an automatic re-render like any other: attributes
     * are re-read and one-shot JS options are not carried over (ADR-002);
     * the seed its unchanged attribute resolved to is kept. */
    return createRenderJob(host, undefined, reason, { keepSeed: true, style: style });
  }

  /* Batched style check: read every host first, then re-render. */
  function checkHosts(hosts, reason) {
    var entries = [];
    hosts.forEach(function (host) {
      var state = STATE.get(host);
      if (state && host.isConnected) {
        entries.push({ host: host, state: state, style: null });
      }
    });
    entries.forEach(function (entry) {
      entry.style = readHostStyle(entry.host, entry.state.options.font);
    });
    var changed = [];
    var jobs = [];
    entries.forEach(function (entry) {
      var outcome = reconcileHostStyle(entry.host, entry.state, entry.style, reason);
      if (outcome) {
        changed.push(entry.host);
        if (outcome !== true) {
          jobs.push(outcome);
        }
      }
    });
    runRenderJobs(jobs);
    return changed;
  }

  // ── Host registry and stylesheet watching ──────────────────

  var HAS_WEAKREF = typeof WeakRef === "function";

  function makeRef(node) {
    return HAS_WEAKREF ? new WeakRef(node) : { deref: function () { return node; } };
  }

  /* Rendered hosts, weakly held. refreshAll() walks this instead of
   * querySelectorAll, which cannot see into shadow roots. */
  var REGISTRY = new Set();
  var REGISTERED = new WeakSet();
  var registryPruneAt = 1024;

  function forEachRegistered(visit) {
    REGISTRY.forEach(function (ref) {
      var host = ref.deref();
      if (!host) {
        REGISTRY.delete(ref);
        return;
      }
      visit(host);
    });
  }

  var WATCHED_ROOTS = new WeakSet();
  var KNOWN_SHADOW_ROOTS = new Set();
  var KNOWN_SHADOW_ROOT_SET = new WeakSet();

  function registerHost(host) {
    if (host.ownerDocument) {
      watchStylesheets(host.ownerDocument);
    }
    var rootNode = typeof host.getRootNode === "function" ? host.getRootNode() : null;
    if (rootNode && rootNode.nodeType === 11 && rootNode.host) {
      /* link `load` is not composed: a shadow root's stylesheets are only
       * seen by a listener on that root. */
      watchStylesheets(rootNode);
      rememberShadowRoot(rootNode);
    }
    if (!HAS_WEAKREF || REGISTERED.has(host)) {
      return;
    }
    REGISTERED.add(host);
    REGISTRY.add(makeRef(host));
    if (REGISTRY.size > registryPruneAt) {
      forEachRegistered(function () {});
      registryPruneAt = Math.max(1024, REGISTRY.size * 2);
    }
  }

  var shadowRootPruneAt = 256;

  function rememberShadowRoot(root) {
    if (KNOWN_SHADOW_ROOT_SET.has(root)) {
      return;
    }
    KNOWN_SHADOW_ROOT_SET.add(root);
    KNOWN_SHADOW_ROOTS.add(makeRef(root));
    if (KNOWN_SHADOW_ROOTS.size > shadowRootPruneAt) {
      KNOWN_SHADOW_ROOTS.forEach(function (ref) {
        if (!ref.deref()) {
          KNOWN_SHADOW_ROOTS.delete(ref);
        }
      });
      shadowRootPruneAt = Math.max(256, KNOWN_SHADOW_ROOTS.size * 2);
    }
    if (connectObserver) {
      observeConnections(root);
    }
  }

  /* Shadow-including containment: hosts inside shadow roots count as
   * descendants of the shadow host and of the document. */
  function composedContains(scope, node) {
    if (scope.nodeType === 9) {
      return node.ownerDocument === scope && node.isConnected === true;
    }
    var current = node;
    while (current) {
      if (current === scope) {
        return true;
      }
      current = current.parentNode || (current.nodeType === 11 ? current.host : null) || null;
    }
    return false;
  }

  function collectHosts(scope) {
    var hosts = [];
    var seen = new Set();
    function add(node) {
      if (node && !seen.has(node)) {
        seen.add(node);
        hosts.push(node);
      }
    }
    if (isElementNode(scope) && STATE.has(scope)) {
      add(scope);
    }
    if (HAS_WEAKREF) {
      forEachRegistered(function (host) {
        if (composedContains(scope, host)) {
          add(host);
        }
      });
    } else if (typeof scope.querySelectorAll === "function") {
      Array.prototype.forEach.call(scope.querySelectorAll('[data-fy-upgraded="true"]'), add);
    }
    return hosts;
  }

  var restyleScheduled = false;
  var RESTYLE_DOCUMENTS = [];

  function scheduleRestyle(doc) {
    if (doc && RESTYLE_DOCUMENTS.indexOf(doc) < 0) {
      RESTYLE_DOCUMENTS.push(doc);
    }
    if (restyleScheduled) {
      return;
    }
    restyleScheduled = true;
    var run = function () {
      restyleScheduled = false;
      RESTYLE_DOCUMENTS.splice(0).forEach(function (target) {
        refreshAll(target);
      });
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 0);
    }
  }

  function handleStylesheetLoad(event) {
    var target = event.target;
    var tag = target && target.tagName;
    if (tag === "STYLE" || (tag === "LINK" && /(^|\s)stylesheet(\s|$)/i.test(target.rel || ""))) {
      scheduleRestyle(target.ownerDocument);
    }
  }

  /* `load` does not bubble, so listen in the capture phase — once per
   * document and per shadow root a host was rendered in (installed lazily on
   * render, so bootstrap:false pages are covered too). Stylesheets that change
   * without a load event (adoptedStyleSheets, edited <style> text) need an
   * explicit FontKku.refreshAll(). */
  function watchStylesheets(root) {
    if (!root || typeof root.addEventListener !== "function" || WATCHED_ROOTS.has(root)) {
      return;
    }
    WATCHED_ROOTS.add(root);
    root.addEventListener("load", handleStylesheetLoad, true);
  }

  // ── Pending resolution (hosts rendered while detached) ─────

  /* A render done while the host was detached cannot resolve font style.
   * Such hosts wait here until they are connected:
   * - custom elements resolve in connectedCallback;
   * - decorators have no lifecycle hook, so while anything is pending one
   *   MutationObserver watches the documents (and known shadow roots) for
   *   insertions, and an animation frame check covers the common
   *   "render, then append" sequence.
   * Hosts are weakly held; the observer disconnects when nothing is pending. */
  var PENDING = new Set();
  var PENDING_REFS = new WeakMap();
  var connectObserver = null;
  var connectObserved = null;
  var pendingFrame = false;

  function trackPending(host) {
    schedulePendingCheck();
    if (PENDING_REFS.has(host)) {
      return;
    }
    var ref = makeRef(host);
    PENDING_REFS.set(host, ref);
    PENDING.add(ref);
    startWatchingConnections(host.ownerDocument);
  }

  function untrackPending(host) {
    var ref = PENDING_REFS.get(host);
    if (!ref) {
      return;
    }
    PENDING_REFS.delete(host);
    PENDING.delete(ref);
    if (!PENDING.size) {
      stopWatchingConnections();
    }
  }

  function observeConnections(root) {
    if (!connectObserver || !root || connectObserved.has(root)) {
      return;
    }
    connectObserved.add(root);
    connectObserver.observe(root, { childList: true, subtree: true });
  }

  function startWatchingConnections(doc) {
    if (typeof MutationObserver !== "function") {
      return;
    }
    if (!connectObserver) {
      connectObserver = new MutationObserver(flushPending);
      connectObserved = new WeakSet();
      KNOWN_SHADOW_ROOTS.forEach(function (ref) {
        var root = ref.deref();
        if (!root) {
          KNOWN_SHADOW_ROOTS.delete(ref);
          return;
        }
        observeConnections(root);
      });
    }
    if (doc && doc.nodeType === 9) {
      observeConnections(doc);
    }
  }

  function stopWatchingConnections() {
    if (connectObserver) {
      connectObserver.disconnect();
      connectObserver = null;
      connectObserved = null;
    }
  }

  function schedulePendingCheck() {
    if (pendingFrame || typeof requestAnimationFrame !== "function") {
      return;
    }
    pendingFrame = true;
    requestAnimationFrame(function () {
      pendingFrame = false;
      flushPending();
    });
  }

  function flushPending() {
    var hosts = [];
    PENDING.forEach(function (ref) {
      var host = ref.deref();
      if (!host) {
        PENDING.delete(ref);
      } else if (host.isConnected) {
        hosts.push(host);
      }
    });
    if (hosts.length) {
      checkHosts(hosts, "connect");
    }
    if (!PENDING.size) {
      stopWatchingConnections();
    }
  }

  // ── Public render surface ──────────────────────────────────

  function renderWithReason(target, options, reason) {
    if (!isElementNode(target)) {
      throw new TypeError("font-kku: render target must be an element");
    }
    return runRenderJobs([createRenderJob(target, options || {}, reason)])[0];
  }

  /* Contract (ADR-002): attributes are the persistent option source. JS
   * options apply to this call only — previously resolved options are never
   * merged back in, so attribute/data-* changes are re-read on every render
   * and seed="auto" re-resolves to a fresh value per render. Every automatic
   * re-render (attribute, text mutation, style re-resolution) re-reads the
   * attributes the same way. `refresh` is the same operation under the name
   * used for already-rendered hosts. */
  function render(target, options) {
    return renderWithReason(target, options, "render");
  }

  function refresh(target, options) {
    return renderWithReason(target, options, "refresh");
  }

  /* Upgrade decisions use this runtime's state, not DOM markers: a clone or
   * an SSR tree carries data-fy-upgraded without being managed. */
  function upgrade(target) {
    if (!isElementNode(target)) {
      return null;
    }
    if (STATE.has(target)) {
      return target;
    }
    return runRenderJobs([createRenderJob(target, undefined, "upgrade")])[0];
  }

  function upgradeAll(root) {
    var scope = root || (typeof document !== "undefined" ? document : null);
    if (!scope || typeof scope.querySelectorAll !== "function") {
      return [];
    }
    var hosts = Array.prototype.slice.call(scope.querySelectorAll("font-kku, .font-kku"));
    runRenderJobs(hosts.filter(function (host) {
      return !STATE.has(host);
    }).map(function (host) {
      return createRenderJob(host, undefined, "upgrade");
    }));
    return hosts;
  }

  /* Font CSS declares structure-changing metadata (--fy-jamo-depth,
   * --fy-expression-mode, --fy-material) that is read at render time. A
   * stylesheet that arrives after the first render (async <link>, framework
   * injection) would otherwise leave the host in the default structure.
   * Re-resolve against the current styles; hosts whose structure changed are
   * re-rendered (attributes re-read, resolved seed kept), hosts whose font
   * id/contract changed get updated fontInfo() without a rebuild, and hosts
   * rendered while detached are finished with their original call options.
   * Covers hosts inside shadow roots; `root` narrows the scope
   * (shadow-including). Returns the hosts whose resolution changed. */
  function refreshAll(root) {
    var scope = root || (typeof document !== "undefined" ? document : null);
    if (!scope) {
      return [];
    }
    return checkHosts(collectHosts(scope), "restyle");
  }

  /* Font metadata as resolved at the last render. `loaded` is false while the
   * requested font's CSS (its --fy-font-id) has not reached the host. */
  function fontInfo(host) {
    var state = STATE.get(host);
    if (!state) {
      return null;
    }
    var meta = state.options.fontMeta;
    return {
      font: state.options.font,
      id: meta.id || null,
      contract: meta.contract,
      material: meta.material,
      loaded: Boolean(meta.id) && foldFontName(meta.id) === state.options.font
    };
  }

  // ── loadFont ───────────────────────────────────────────────

  var FONT_LOADS = new WeakMap();

  function findStylesheetLink(root, absolute) {
    if (typeof root.querySelectorAll !== "function") {
      return null;
    }
    return Array.prototype.find.call(
      root.querySelectorAll('link[rel~="stylesheet"]'),
      function (link) { return link.href === absolute; }
    ) || null;
  }

  /* A link whose load already settled has a sheet — but Chromium also gives
   * a failed link an empty sheet, so only a readable sheet with rules counts
   * as loaded. Anything else (failed, empty, or cross-origin and therefore
   * unreadable) is requested again through a fresh link; a successful
   * cross-origin sheet then comes from the HTTP cache. */
  function linkLooksLoaded(link) {
    if (!link.sheet) {
      return false;
    }
    try {
      return link.sheet.cssRules.length > 0;
    } catch (error) {
      return false;
    }
  }

  /* Static-only font loading: insert a stylesheet link (or reuse one already
   * in `root`), wait for it and re-resolve every rendered host in `root`.
   * - `options.root`: a Document (link goes to its <head>, the default is the
   *   current document) or a ShadowRoot (link goes into the shadow root —
   *   document stylesheets do not style shadow trees).
   * - Repeated calls for the same URL and root return the same Promise while
   *   it is pending or resolved and its link is still connected. A removed
   *   link is inserted again.
   * - Success is judged by this call's own load/error listeners. On error the
   *   inserted link is removed, the Promise rejects and the next call
   *   retries.
   * Resolves with the hosts whose resolution changed when the load finished. */
  function loadFont(href, options) {
    var root = (options && options.root) || (typeof document !== "undefined" ? document : null);
    if (!root || (root.nodeType !== 9 && root.nodeType !== 11)) {
      return Promise.reject(new Error("font-kku: loadFont needs a Document or ShadowRoot"));
    }
    var doc = root.nodeType === 9 ? root : root.ownerDocument;
    var absolute = new URL(href, doc.baseURI).href;
    var loads = FONT_LOADS.get(root);
    if (!loads) {
      loads = new Map();
      FONT_LOADS.set(root, loads);
    }
    var cached = loads.get(absolute);
    if (cached && cached.link.isConnected) {
      return cached.promise;
    }
    loads.delete(absolute);

    var entry = { link: null, promise: null };
    var link = findStylesheetLink(root, absolute);
    if (link && linkLooksLoaded(link)) {
      entry.link = link;
      entry.promise = Promise.resolve(refreshAll(root));
      loads.set(absolute, entry);
      return entry.promise;
    }
    /* A still-loading author link is awaited; a settled one without rules
     * (failed) is not trusted — a fresh link retries the request. */
    var owned = !link || Boolean(link.sheet);
    if (owned) {
      link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = absolute;
    }
    entry.link = link;
    entry.promise = new Promise(function (resolve, reject) {
      function cleanup() {
        link.removeEventListener("load", onLoad);
        link.removeEventListener("error", onError);
      }
      function onLoad() {
        cleanup();
        resolve(refreshAll(root));
      }
      function onError() {
        cleanup();
        if (loads.get(absolute) === entry) {
          loads.delete(absolute);
        }
        if (owned && link.parentNode) {
          link.parentNode.removeChild(link);
        }
        reject(new Error("font-kku: failed to load font stylesheet " + absolute));
      }
      link.addEventListener("load", onLoad);
      link.addEventListener("error", onError);
    });
    loads.set(absolute, entry);
    if (owned) {
      (root.nodeType === 9 ? (doc.head || doc.documentElement) : root).appendChild(link);
    }
    return entry.promise;
  }

  // ── Custom element and bootstrap ───────────────────────────

  var DEFINE_BATCH = null;
  var PARSE_DEFERRED = [];
  var PARSE_LISTENING = new WeakSet();

  /* A parser-created <font-kku> is connected when its start tag is parsed,
   * before its text. Rendering then would record an empty source. */
  function awaitingParse(host) {
    var doc = host.ownerDocument;
    return Boolean(doc) && doc.readyState === "loading" && !host.firstChild;
  }

  function flushParseDeferred() {
    var ready = [];
    PARSE_DEFERRED = PARSE_DEFERRED.filter(function (host) {
      if (host.ownerDocument && host.ownerDocument.readyState === "loading") {
        return true;
      }
      if (ready.indexOf(host) < 0) {
        ready.push(host);
      }
      return false;
    });
    runRenderJobs(ready.filter(function (host) {
      return host.isConnected && !STATE.has(host);
    }).map(function (host) {
      return createRenderJob(host, undefined, "connect");
    }));
  }

  function deferUntilParsed(host) {
    PARSE_DEFERRED.push(host);
    var doc = host.ownerDocument;
    if (!PARSE_LISTENING.has(doc)) {
      PARSE_LISTENING.add(doc);
      doc.addEventListener("DOMContentLoaded", function () {
        PARSE_LISTENING.delete(doc);
        flushParseDeferred();
      }, { once: true });
    }
  }

  function connectCustomElement(host) {
    var state = STATE.get(host);
    if (!state) {
      if (awaitingParse(host)) {
        deferUntilParsed(host);
      } else if (DEFINE_BATCH) {
        DEFINE_BATCH.push(host);
      } else {
        runRenderJobs([createRenderJob(host, undefined, "connect")]);
      }
      return;
    }
    /* Reconnected: catch up on what changed while the observer was off. */
    if (snapshotOptions(host, state.hostMode) !== state.snapshot) {
      rerender(host, "attribute");
      return;
    }
    var liveSource = readLiveSource(host, state);
    if (liveSource !== state.source) {
      rerender(host, "mutation", liveSource);
      return;
    }
    if (!state.observer) {
      observeHost(host, state);
    }
    if (state.unresolved) {
      /* Rendered while detached: resolve now, synchronously. */
      checkHosts([host], "connect");
    } else {
      /* Moved: the new place may style it differently. Checked in a batch
       * with every other host connected in this frame. */
      trackPending(host);
    }
  }

  function define() {
    if (typeof customElements === "undefined" || typeof HTMLElement === "undefined" ||
        customElements.get("font-kku")) {
      return;
    }

    var FontKkuElement = class FontKkuElement extends HTMLElement {
      static get observedAttributes() {
        return OPTION_KEYS.slice();
      }

      connectedCallback() {
        connectCustomElement(this);
      }

      disconnectedCallback() {
        var state = STATE.get(this);
        if (state && state.observer) {
          state.observer.disconnect();
          state.observer = undefined;
        }
      }

      /* The first render reads every attribute, so callbacks before it (the
       * upgrade replays one per attribute) are skipped, as are writes that
       * leave the option inputs as they were. A change while disconnected is
       * picked up on reconnect. */
      attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) {
          return;
        }
        var state = STATE.get(this);
        if (!state || !this.isConnected) {
          return;
        }
        if (snapshotOptions(this, state.hostMode) !== state.snapshot) {
          rerender(this, "attribute");
        }
      }
    };

    CUSTOM_ELEMENT_CLASS = FontKkuElement;
    /* define() upgrades every <font-kku> already in the document; batch
     * their first renders (see runRenderJobs). */
    DEFINE_BATCH = [];
    try {
      customElements.define("font-kku", FontKkuElement);
    } finally {
      var batch = DEFINE_BATCH;
      DEFINE_BATCH = null;
      runRenderJobs(batch.filter(function (host) {
        return !STATE.has(host);
      }).map(function (host) {
        return createRenderJob(host, undefined, "connect");
      }));
    }
  }

  function bootstrap(root) {
    if (typeof document === "undefined") {
      return [];
    }
    define();
    watchStylesheets(document);
    return upgradeAll(root || document);
  }

  function shouldAutoBootstrap() {
    var config = global && global.FontKkuConfig;
    return !(config && config.bootstrap === false);
  }

  // ── Text Mode Renderer ──────────────────────────────────────

  var JAMO_TO_COMPAT = {
    "\u1100": "\u3131", "\u1101": "\u3132", "\u1102": "\u3134", "\u1103": "\u3137", "\u1104": "\u3138",
    "\u1105": "\u3139", "\u1106": "\u3141", "\u1107": "\u3142", "\u1108": "\u3143", "\u1109": "\u3145",
    "\u110A": "\u3146", "\u110B": "\u3147", "\u110C": "\u3148", "\u110D": "\u3149", "\u110E": "\u314A",
    "\u110F": "\u314B", "\u1110": "\u314C", "\u1111": "\u314D", "\u1112": "\u314E",
    "\u1161": "\u314F", "\u1162": "\u3150", "\u1163": "\u3151", "\u1164": "\u3152", "\u1165": "\u3153",
    "\u1166": "\u3154", "\u1167": "\u3155", "\u1168": "\u3156", "\u1169": "\u3157", "\u116A": "\u3158",
    "\u116B": "\u3159", "\u116C": "\u315A", "\u116D": "\u315B", "\u116E": "\u315C", "\u116F": "\u315D",
    "\u1170": "\u315E", "\u1171": "\u315F", "\u1172": "\u3160", "\u1173": "\u3161", "\u1174": "\u3162",
    "\u1175": "\u3163",
    "\u11A8": "\u3131", "\u11A9": "\u3132", "\u11AA": "\u3133", "\u11AB": "\u3134", "\u11AC": "\u3135",
    "\u11AD": "\u3136", "\u11AE": "\u3137", "\u11AF": "\u3139", "\u11B0": "\u313A", "\u11B1": "\u313B",
    "\u11B2": "\u313C", "\u11B3": "\u313D", "\u11B4": "\u313E", "\u11B5": "\u313F", "\u11B6": "\u3140",
    "\u11B7": "\u3141", "\u11B8": "\u3142", "\u11B9": "\u3144", "\u11BA": "\u3145", "\u11BB": "\u3146",
    "\u11BC": "\u3147", "\u11BD": "\u3148", "\u11BE": "\u314A", "\u11BF": "\u314B", "\u11C0": "\u314C",
    "\u11C1": "\u314D", "\u11C2": "\u314E"
  };

  var FW_SP = "\u3000";

  /* BEGIN GENERATED display-width: scripts/generate_sidecar_tables.js mirrors
   * spec/tables.json unicode.displayWidth.wide here. Do not edit by hand. */
  var DISPLAY_WIDE_RANGES = [
    "1100-115F 231A-231B 2329-232A 23E9-23EC 23F0 23F3 25FD-25FE 2614-2615",
    "2630-2637 2648-2653 267F 268A-268F 2693 26A1 26AA-26AB 26BD-26BE",
    "26C4-26C5 26CE 26D4 26EA 26F2-26F3 26F5 26FA 26FD",
    "2705 270A-270B 2728 274C 274E 2753-2755 2757 2795-2797",
    "27B0 27BF 2B1B-2B1C 2B50 2B55 2E80-2E99 2E9B-2EF3 2F00-2FD5",
    "2FF0-3029 302E-303E 3041-3096 309B-30FF 3105-312F 3131-318E 3190-31E5 31EF-321E",
    "3220-3247 3250-A48C A490-A4C6 A960-A97C AC00-D7A3 F900-FAFF FE10-FE19 FE30-FE52",
    "FE54-FE66 FE68-FE6B FF01-FF60 FFE0-FFE6 16FE0-16FE3 16FF0-16FF6 17000-18CD5 18CFF-18D1E",
    "18D80-18DF2 1AFF0-1AFF3 1AFF5-1AFFB 1AFFD-1AFFE 1B000-1B122 1B132 1B150-1B152 1B155",
    "1B164-1B167 1B170-1B2FB 1D300-1D356 1D360-1D376 1F004 1F0CF 1F18E 1F191-1F19A",
    "1F200-1F202 1F210-1F23B 1F240-1F248 1F250-1F251 1F260-1F265 1F300-1F320 1F32D-1F335 1F337-1F37C",
    "1F37E-1F393 1F3A0-1F3CA 1F3CF-1F3D3 1F3E0-1F3F0 1F3F4 1F3F8-1F43E 1F440 1F442-1F4FC",
    "1F4FF-1F53D 1F54B-1F54E 1F550-1F567 1F57A 1F595-1F596 1F5A4 1F5FB-1F64F 1F680-1F6C5",
    "1F6CC 1F6D0-1F6D2 1F6D5-1F6D8 1F6DC-1F6DF 1F6EB-1F6EC 1F6F4-1F6FC 1F7E0-1F7EB 1F7F0",
    "1F90C-1F93A 1F93C-1F945 1F947-1F9FF 1FA70-1FA7C 1FA80-1FA8A 1FA8E-1FAC6 1FAC8 1FACD-1FADC",
    "1FADF-1FAEA 1FAEF-1FAF8 20000-2FFFD 30000-3FFFD"
  ].join(" ");
  /* END GENERATED display-width */

  /* Terminal column width (wcwidth convention, spec/tables.json
   * unicode.displayWidth): combining/format/control code points and the
   * conjoining Hangul jungseong/jongseong take no column, the wide table takes
   * two, everything else one. The zero-width classes come from the engine's
   * RegExp like the rest of the runtime's Unicode classification; East Asian
   * Width has no RegExp property, so the wide table is a generated mirror. */
  var ZERO_WIDTH_CHAR = /^[\p{Mn}\p{Me}\p{Cf}\p{Cc}]$/u;
  var emojiClusterBase;
  var displayWideRanges = null;

  /* Compiled on first use: a \p{Extended_Pictographic} literal would be a
   * parse error for the whole runtime on engines older than the property.
   * Those engines have no Intl.Segmenter either, so they never produce a
   * multi-code-point cluster and the emoji rule has nothing to decide. */
  function startsEmojiCluster(char) {
    if (emojiClusterBase === undefined) {
      try {
        emojiClusterBase = new RegExp("^[\\p{Extended_Pictographic}\\u{1F1E6}-\\u{1F1FF}]$", "u");
      } catch (error) {
        emojiClusterBase = null;
      }
    }
    return emojiClusterBase !== null && emojiClusterBase.test(char);
  }

  function isDisplayWide(code) {
    if (!displayWideRanges) {
      displayWideRanges = DISPLAY_WIDE_RANGES ? DISPLAY_WIDE_RANGES.split(" ").map(function (token) {
        var bounds = token.split("-");
        var first = parseInt(bounds[0], 16);
        return [first, bounds.length > 1 ? parseInt(bounds[1], 16) : first];
      }) : [];
    }
    var low = 0;
    var high = displayWideRanges.length - 1;
    while (low <= high) {
      var mid = (low + high) >> 1;
      if (code < displayWideRanges[mid][0]) {
        high = mid - 1;
      } else if (code > displayWideRanges[mid][1]) {
        low = mid + 1;
      } else {
        return true;
      }
    }
    return false;
  }

  function codePointColumns(char) {
    var code = char.codePointAt(0);
    if ((code !== 0xAD && ZERO_WIDTH_CHAR.test(char)) ||
        (code >= 0x1160 && code <= 0x11FF) || (code >= 0xD7B0 && code <= 0xD7FF)) {
      return 0;
    }
    return isDisplayWide(code) ? 2 : 1;
  }

  /* Columns one grapheme occupies: the sum of its code points, except that a
   * multi-code-point cluster led by an Extended_Pictographic or a Regional
   * Indicator (ZWJ sequence, modifier, flag, VS16, tag sequence) is one emoji
   * (two columns) unless U+FE0E asks for text presentation. */
  function graphemeColumns(text) {
    var chars = Array.from(text);
    if (chars.length > 1 && text.indexOf("\uFE0E") < 0 && startsEmojiCluster(chars[0])) {
      return 2;
    }
    return chars.reduce(function (sum, char) {
      return sum + codePointColumns(char);
    }, 0);
  }

  function toCompat(jamo) {
    return JAMO_TO_COMPAT[jamo] || jamo;
  }

  function toFullWidth(ch) {
    var code = ch.charCodeAt(0);
    if (code >= 0x21 && code <= 0x7E) {
      return String.fromCharCode(code + 0xFEE0) + ch.slice(1);
    }
    return ch;
  }

  function composePartialSyllable(choIndex, jungIndex) {
    return String.fromCharCode(HANGUL_BASE + choIndex * 21 * 28 + jungIndex * 28);
  }

  /* A non-Hangul cell spans as many fullwidth (two-column) cells as its
   * grapheme needs, at least one. An odd width is padded with ASCII spaces on
   * the top row, so both rows of every cell have the same column width. */
  function renderPlainGlyphTextMode(glyph) {
    var top = toFullWidth(glyph.source);
    var columns = graphemeColumns(top);
    var cells = Math.max(1, Math.ceil(columns / 2));
    return {
      top: top + " ".repeat(cells * 2 - columns),
      bottom: FW_SP.repeat(cells)
    };
  }

  function renderGlyphTextMode(glyph) {
    if (glyph.kind !== "hangul") {
      return renderPlainGlyphTextMode(glyph);
    }

    var syllableIndex = glyph.source.charCodeAt(0) - HANGUL_BASE;
    var choIndex = Math.floor(syllableIndex / (21 * 28));
    var jungIndex = Math.floor((syllableIndex % (21 * 28)) / 28);
    var jungLayout = glyph.topology.jungLayout;
    var jongLayout = glyph.topology.jongLayout;
    var cho = glyph.sourceJamo.choseong;
    var jung = glyph.sourceJamo.jungseong;
    var jong = glyph.sourceJamo.jongseong;
    var top, bottom;

    if (jungLayout === "right") {
      top = toCompat(cho) + toCompat(jung);
      if (jongLayout === "none") {
        bottom = FW_SP + FW_SP;
      } else if (jongLayout === "single") {
        bottom = FW_SP + toCompat(jong);
      } else {
        var dj = HANGUL_TABLES.doubleJongseong[jong];
        bottom = toCompat(dj.parts[0]) + toCompat(dj.parts[1]);
      }
    } else if (jungLayout === "bottom") {
      if (jongLayout === "none") {
        top = toCompat(cho);
        bottom = toCompat(jung);
      } else if (jongLayout === "single") {
        var partial = composePartialSyllable(choIndex, jungIndex);
        top = partial;
        bottom = toCompat(jong);
      } else {
        var partial = composePartialSyllable(choIndex, jungIndex);
        top = partial + FW_SP;
        var dj = HANGUL_TABLES.doubleJongseong[jong];
        bottom = toCompat(dj.parts[0]) + toCompat(dj.parts[1]);
      }
    } else {
      var split = HANGUL_TABLES.splitJungseong[jung];
      var baseJungIndex = HANGUL_TABLES.jungseong.indexOf(split.parts[0]);
      var partial = composePartialSyllable(choIndex, baseJungIndex);
      top = partial + toCompat(split.parts[1]);
      if (jongLayout === "none") {
        bottom = FW_SP + FW_SP;
      } else if (jongLayout === "single") {
        bottom = FW_SP + toCompat(jong);
      } else {
        var dj = HANGUL_TABLES.doubleJongseong[jong];
        bottom = toCompat(dj.parts[0]) + toCompat(dj.parts[1]);
      }
    }

    return { top: top, bottom: bottom };
  }

  function renderLineTextMode(line) {
    var topParts = [];
    var bottomParts = [];

    line.children.forEach(function (child, childIndex) {
      if (child.type === "word") {
        if (childIndex > 0 && line.children[childIndex - 1].type !== "space") {
          topParts.push(FW_SP);
          bottomParts.push(FW_SP);
        }
        child.children.forEach(function (glyph, glyphIndex) {
          if (glyphIndex > 0) {
            topParts.push(FW_SP);
            bottomParts.push(FW_SP);
          }
          var rendered = renderGlyphTextMode(glyph);
          topParts.push(rendered.top);
          bottomParts.push(rendered.bottom);
        });
      } else if (child.type === "space") {
        for (var spaceIndex = 0; spaceIndex < child.count; spaceIndex += 1) {
          topParts.push(FW_SP);
          bottomParts.push(FW_SP);
        }
      }
    });

    return { top: topParts.join(""), bottom: bottomParts.join("") };
  }

  /* Text mode draws on a fixed two-cell grid and rebuilds the cluster split
   * from sourceJamo, so it is atomic by construction. Depth is deliberately not
   * an option here: accepting one that changes nothing would be a trap. */
  function renderText(text) {
    var model = buildTextModel(text);
    var output = [];

    model.lines.forEach(function (line) {
      var pair = renderLineTextMode(line);
      output.push(pair.top);
      output.push(pair.bottom);
    });

    return output;
  }

  // ── Seed helpers ───────────────────────────────────────────

  function hashSeed(value) {
    var str = String(value == null ? "" : value);
    var h = 2166136261;
    for (var i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 1000000) / 1000000;
  }

  /* The resolved seed of the host a jamo node belongs to ("" without one). */
  function hostSeedOf(node, target) {
    var host = typeof node.closest === "function" ? node.closest('[data-fy-upgraded="true"]') : null;
    if (!host && isElementNode(target) && target.dataset && target.dataset.fyUpgraded === "true") {
      host = target;
    }
    return host && host.dataset.fySeed !== undefined ? host.dataset.fySeed : "";
  }

  /* Per-jamo seed: hash of jamo | role | index | salt, plus "| host seed"
   * when the host has a resolved seed. Hosts with different seeds therefore
   * get different jamo seeds; a host without a seed keeps the historical
   * key, so its values are unchanged. */
  function applyJamoSeeds(target, options) {
    var type = target && target.nodeType;
    if (!(type === 1 || type === 9 || type === 11) || typeof target.querySelectorAll !== "function") {
      return 0;
    }
    var opts = options || {};
    var property = opts.property || "--fy-jamo-seed";
    var hashFn = typeof opts.hash === "function" ? opts.hash : hashSeed;
    var saltRaw = opts.salt == null ? "" : String(opts.salt);
    var nodes = target.querySelectorAll("[data-jamo]");
    Array.prototype.forEach.call(nodes, function (node, index) {
      var seed = hostSeedOf(node, target);
      var key = node.dataset.jamo + "|" + (node.dataset.jamoRole || "") + "|" + index + "|" + saltRaw +
        (seed ? "|" + seed : "");
      node.style.setProperty(property, String(hashFn(key)));
    });
    return nodes.length;
  }

  // ── Vector jamo (ADR-013) ──────────────────────────────────

  /* A jamo set draws each jamo as an inline SVG instead of a sheet cell. It is
   * registered in code (FontKku.registerJamo, or a module pushed onto
   * globalThis.FontKkuJamo before the runtime loads) and picked per host with
   * jamo-set="<name>" (data-jamo-set on a decorator). It works on fonts with a
   * sprite layout: the font's CSS still places every node and chooses its
   * --fy-sprite-row; the set supplies the drawing of each cell "r<row>-<jamo>"
   * in a 0–100 cell. Shapes are path data or ellipses, built with
   * createElementNS — a set never injects markup. */
  var JAMO_SETS = Object.create(null);
  var JAMO_SET_NAME = /^[a-z0-9][a-z0-9-]*$/;
  var JAMO_CELL_KEY = /^r([0-9])-([\u3131-\u318e])$/;
  var JAMO_PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/;
  var VECTOR_CAPS = { butt: true, round: true, square: true };
  var VECTOR_JOINS = { miter: true, round: true, bevel: true };
  var SVG_NS = "http://www.w3.org/2000/svg";
  var DEFAULT_VECTOR_STROKE = 7.2;

  function normalizeJamoSetName(value) {
    if (isBlank(value)) {
      return null;
    }
    var name = String(value).trim().toLowerCase();
    return JAMO_SET_NAME.test(name) ? name : null;
  }

  function normalizeJamoShape(shape, where) {
    var item = typeof shape === "string" ? { d: shape } : shape;
    if (!item || typeof item !== "object") {
      throw new TypeError("font-kku: " + where + " must be path data or { d } / { ellipse }");
    }
    var fill = item.fill === true;
    if (typeof item.d === "string") {
      var d = item.d.trim();
      if (!d || !JAMO_PATH_DATA.test(d)) {
        throw new TypeError("font-kku: " + where + " path data may only hold SVG path commands and numbers");
      }
      return { type: "path", d: d, fill: fill };
    }
    if (Array.isArray(item.ellipse) && item.ellipse.length === 4) {
      var values = item.ellipse.map(Number);
      if (!values.every(function (value) { return isFinite(value); }) || values[2] < 0 || values[3] < 0) {
        throw new TypeError("font-kku: " + where + " ellipse is [cx, cy, rx, ry] with finite numbers");
      }
      return { type: "ellipse", values: values, fill: fill };
    }
    throw new TypeError("font-kku: " + where + " must be path data or { d } / { ellipse: [cx, cy, rx, ry] }");
  }

  /* registerJamo(name, cells, options) — cells maps "r<row>-<호환 자모>" (e.g.
   * "r0-ㄱ") to one shape or a list: "M5 12 H45 V28" (a stroked centerline),
   * { d, fill: true } (a filled outline) or { ellipse: [cx, cy, rx, ry] }.
   * options: stroke (width in cell units, default 7.2; 0 for fill-only sets),
   * cap (butt|round|square), join (miter|round|bevel). Re-registering a name
   * replaces it; hosts using it re-render. Returns { name, cells }. */
  function registerJamo(name, cells, options) {
    var setName = normalizeJamoSetName(name);
    if (!setName) {
      throw new TypeError("font-kku: a jamo set name is lowercase letters, digits and '-' (got " + JSON.stringify(name) + ")");
    }
    if (!cells || typeof cells !== "object" || Array.isArray(cells)) {
      throw new TypeError("font-kku: registerJamo(\"" + setName + "\") needs a cell map like { \"r0-ㄱ\": \"M5 12 H45 V28\" }");
    }
    var opts = options || {};
    var stroke = opts.stroke === undefined || opts.stroke === null ? DEFAULT_VECTOR_STROKE : Number(opts.stroke);
    if (!isFinite(stroke) || stroke < 0) {
      throw new TypeError("font-kku: jamo set stroke is a width in cell units (0–100)");
    }
    var cap = opts.cap === undefined ? "butt" : String(opts.cap);
    var join = opts.join === undefined ? "miter" : String(opts.join);
    if (!VECTOR_CAPS[cap] || !VECTOR_JOINS[join]) {
      throw new TypeError("font-kku: jamo set cap is butt|round|square and join is miter|round|bevel");
    }
    var map = Object.create(null);
    var count = 0;
    Object.keys(cells).forEach(function (key) {
      var match = JAMO_CELL_KEY.exec(key);
      if (!match || !resolveSpriteJamo(match[2])) {
        throw new TypeError("font-kku: jamo cell \"" + key + "\" must be r<row>-<compatibility jamo>, e.g. r0-ㄱ");
      }
      var value = cells[key];
      map[key] = (Array.isArray(value) ? value : [value]).map(function (shape, index) {
        return normalizeJamoShape(shape, key + "[" + index + "]");
      });
      count += 1;
    });
    JAMO_SETS[setName] = {
      name: setName,
      stroke: stroke,
      cap: cap,
      join: join,
      cells: map,
      templates: typeof WeakMap === "function" ? new WeakMap() : null
    };
    rerenderJamoSetHosts(setName);
    return { name: setName, cells: count };
  }

  function jamoSets() {
    return Object.keys(JAMO_SETS);
  }

  function vectorSetFor(options) {
    if (!options || !options.jamoSet || !options.fontMeta || options.fontMeta.material !== "sprite") {
      return null;
    }
    return JAMO_SETS[options.jamoSet] || null;
  }

  /* A set registered after its hosts rendered (a module that loads later)
   * re-renders them like a style change: attributes re-read, seed kept. */
  function rerenderJamoSetHosts(setName) {
    var jobs = [];
    forEachRegistered(function (host) {
      var state = STATE.get(host);
      if (state && host.isConnected && state.options.jamoSet === setName) {
        jobs.push(createRenderJob(host, undefined, "restyle", { keepSeed: true }));
      }
    });
    if (jobs.length) {
      runRenderJobs(jobs);
    }
  }

  function vectorCell(set, key, doc) {
    var shapes = set.cells[key];
    if (!shapes || !doc || typeof doc.createElementNS !== "function") {
      return null;
    }
    var cache = set.templates ? set.templates.get(doc) : null;
    if (!cache) {
      cache = Object.create(null);
      if (set.templates) {
        set.templates.set(doc, cache);
      }
    }
    if (!cache[key]) {
      var svg = doc.createElementNS(SVG_NS, "svg");
      svg.setAttribute("part", "vector");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
      svg.setAttribute("data-cell", key);
      /* Presentation attributes: page CSS (stroke-linecap …) still wins. */
      svg.setAttribute("stroke-linecap", set.cap);
      svg.setAttribute("stroke-linejoin", set.join);
      if (svg.style && typeof svg.style.setProperty === "function") {
        svg.style.setProperty("--fy-vector-stroke-cells", String(set.stroke));
      }
      shapes.forEach(function (shape) {
        var element;
        if (shape.type === "path") {
          element = doc.createElementNS(SVG_NS, "path");
          element.setAttribute("d", shape.d);
        } else {
          element = doc.createElementNS(SVG_NS, "ellipse");
          ["cx", "cy", "rx", "ry"].forEach(function (attribute, index) {
            element.setAttribute(attribute, String(shape.values[index]));
          });
        }
        if (shape.fill) {
          element.setAttribute("data-fill", "");
        }
        svg.appendChild(element);
      });
      cache[key] = svg;
    }
    return cache[key].cloneNode(true);
  }

  /* After a batch is committed: read every vector node's row (one style
   * recalculation for the batch), then append the cell drawings. The row is
   * the font's --fy-sprite-row, so contexts that switch rows (bottom-vowel
   * initials, codas, clusters) draw the same cell the sheet would. */
  function paintVectorJamo(hosts) {
    var work = [];
    hosts.forEach(function (host) {
      var state = STATE.get(host);
      var set = state ? vectorSetFor(state.options) : null;
      if (!set || !host.isConnected) {
        return;
      }
      var root = getManagedRoot(host);
      if (!root || typeof root.querySelectorAll !== "function") {
        return;
      }
      var kinds = String(state.options.fontMeta.spriteKinds || "").split(/\s+/);
      var nodes = root.querySelectorAll("[data-sprite-jamo-kind]");
      for (var i = 0; i < nodes.length; i += 1) {
        if (kinds.indexOf(nodes[i].dataset.spriteJamoKind) >= 0) {
          work.push({ node: nodes[i], set: set, doc: host.ownerDocument, key: null });
        }
      }
    });
    work.forEach(function (item) {
      var style = computedStyleFor(item.node);
      var row = style ? parseInt(style.getPropertyValue("--fy-sprite-row"), 10) : 0;
      item.key = "r" + (isNaN(row) ? 0 : row) + "-" + item.node.dataset.spriteJamo;
    });
    work.forEach(function (item) {
      var svg = vectorCell(item.set, item.key, item.doc);
      if (svg) {
        item.node.appendChild(svg);
      }
    });
  }

  /* Modules may load before the runtime: they push [name, cells, options]
   * onto globalThis.FontKkuJamo. Drain the queue, then make later pushes
   * register directly. */
  function drainJamoQueue(scope) {
    var queue = scope.FontKkuJamo;
    var pending = Array.isArray(queue) ? queue.slice() : [];
    scope.FontKkuJamo = {
      push: function () {
        Array.prototype.forEach.call(arguments, function (entry) {
          registerQueuedJamo(scope, entry);
        });
        return 0;
      }
    };
    pending.forEach(function (entry) {
      registerQueuedJamo(scope, entry);
    });
  }

  /* The global runtime is the canonical one (a second copy reuses it), so a
   * queued set goes to whichever instance window.FontKku is now. */
  function registerQueuedJamo(scope, entry) {
    var api = scope.FontKku && typeof scope.FontKku.registerJamo === "function" ? scope.FontKku : FontKku;
    try {
      api.registerJamo(entry[0], entry[1], entry[2]);
    } catch (error) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn(error.message);
      }
    }
  }

  // ── Device Hangul font probe ───────────────────────────────

  /* Can this browser draw Hangul with a device font? System-material fonts
   * (sebul, gothic and their derived fonts) draw every jamo node with the
   * device's Hangul font, so on a device without one they show tofu; sprite
   * fonts paint their sheet and keep working. The probe compares the glyph
   * box (canvas measureText) of a syllable and of a conjoining jamo with the
   * box of an unassigned code point nearby: a missing glyph is drawn as the
   * same notdef/tofu box (or a same-sized hex box) as the unassigned one, a
   * real glyph is not. Text metrics only — no pixel readback. Returns true or
   * false, or null when it cannot tell (no DOM/canvas, e.g. Node, or an engine
   * without actualBoundingBox metrics). Never runs on its own; the answer is
   * cached per font-family string. */
  var HANGUL_FONT_PROBES = [["가", "힤"], ["ᄀ", "͸"]];
  var DEFAULT_PROBE_FAMILY = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif';
  var HANGUL_FONT_CACHE = {};

  function measureGlyphBox(context, char) {
    var metrics = context.measureText(char);
    if (!metrics || typeof metrics.actualBoundingBoxAscent !== "number") {
      return null;
    }
    return [
      metrics.width,
      metrics.actualBoundingBoxLeft,
      metrics.actualBoundingBoxRight,
      metrics.actualBoundingBoxAscent,
      metrics.actualBoundingBoxDescent
    ].map(function (value) {
      return Math.round(value * 10);
    }).join(",");
  }

  function probeHangulFont(family, doc) {
    var context = null;
    try {
      var canvas = doc.createElement("canvas");
      context = canvas && typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
    } catch (error) {
      context = null;
    }
    if (!context || typeof context.measureText !== "function") {
      return null;
    }
    context.font = "64px " + family;
    for (var i = 0; i < HANGUL_FONT_PROBES.length; i += 1) {
      var glyph = measureGlyphBox(context, HANGUL_FONT_PROBES[i][0]);
      var missing = measureGlyphBox(context, HANGUL_FONT_PROBES[i][1]);
      if (glyph === null || missing === null) {
        return null;
      }
      if (glyph === missing) {
        return false;
      }
    }
    return true;
  }

  function hasHangulFont(options) {
    var opts = options || {};
    var family = opts.fontFamily ? String(opts.fontFamily) : DEFAULT_PROBE_FAMILY;
    var doc = opts.document || (typeof document !== "undefined" ? document : null);
    if (!doc || typeof doc.createElement !== "function") {
      return null;
    }
    if (Object.prototype.hasOwnProperty.call(HANGUL_FONT_CACHE, family) && !opts.document) {
      return HANGUL_FONT_CACHE[family];
    }
    var result = probeHangulFont(family, doc);
    if (result !== null && !opts.document) {
      HANGUL_FONT_CACHE[family] = result;
    }
    return result;
  }

  // ── Public API ─────────────────────────────────────────────

  var FontKku = {
    version: VERSION,
    placementTable: PUBLIC_PLACEMENT_TABLE,
    placementTables: PUBLIC_PLACEMENT_TABLES,
    define: define,
    bootstrap: bootstrap,
    render: render,
    refresh: refresh,
    refreshAll: refreshAll,
    loadFont: loadFont,
    fontInfo: fontInfo,
    upgrade: upgrade,
    upgradeAll: upgradeAll,
    decomposeGlyph: decomposeGlyph,
    createTextModel: createTextModel,
    isHangulSyllable: isHangulSyllable,
    renderText: renderText,
    hashSeed: hashSeed,
    applyJamoSeeds: applyJamoSeeds,
    hasHangulFont: hasHangulFont,
    registerJamo: registerJamo,
    jamoSets: jamoSets
  };

  global.FontKku = FontKku;
  drainJamoQueue(global);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontKku;
  }

  // ── Script-tag loader ──────────────────────────────────────

  /* 한 줄 설치: `<script src=".../font-kku.js" data-fonts="sebul neon">`.
   * data-fonts 속성이 있는 classic script로 로드되면 스크립트 URL 기준으로 base CSS
   * (font-kku.css)와 나열한 폰트(profiles/<name>.css)를 loadFont로 붙인다. 이름은
   * 공백·쉼표로 나누고 host의 font 속성과 같은 규칙으로 정규화한다(alias →
   * canonical). 빈 값이면 base CSS만 붙인다. 같은 URL의 link가 이미 있으면 loadFont가
   * 재사용한다. CSS가 모두 도착(또는 실패)할 때까지 관리 root를 visibility로 가려
   * 조립 전 자모가 보이지 않게 하고, 늦어도 SCRIPT_LOADER_REVEAL_MS 뒤에는 드러낸다.
   * ESM import에는 currentScript가 없어 동작하지 않는다 — 번들러는 CSS를 import한다.
   * data-addons="looks motion fx"는 같은 자리의 확장(ADR-017)을 함께 붙인다 — 꾸밈·변주
   * 클래스(font-kku-looks.css), 자모 움직임(font-kku-motion.css), 상호작용(font-kku-fx.js).
   * data-fonts 없이 data-addons만 있어도 base CSS와 확장을 붙인다. */
  var SCRIPT_LOADER_REVEAL_MS = 3000;
  var SCRIPT_LOADER_ADDONS = {
    looks: { css: "font-kku-looks.css" },
    motion: { css: "font-kku-motion.css" },
    fx: { js: "font-kku-fx.js" }
  };
  var SCRIPT_LOADER_FONT_NAME = /^[a-z0-9][a-z0-9-]*$/;

  function scriptLoaderFonts(value) {
    var names = [];
    String(value).split(/[\s,]+/).forEach(function (raw) {
      if (!foldFontName(raw)) {
        return;
      }
      var name = normalizeFontName(raw);
      if (SCRIPT_LOADER_FONT_NAME.test(name) && names.indexOf(name) === -1) {
        names.push(name);
      }
    });
    return names;
  }

  /* data-addons 이름 → 붙일 확장. 대소문자를 접고 중복·모르는 이름은 버린다(모르는 이름은 경고). */
  function scriptLoaderAddons(value) {
    var names = [];
    String(value).split(/[\s,]+/).forEach(function (raw) {
      var name = raw.trim().toLowerCase();
      if (!name || names.indexOf(name) !== -1) {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(SCRIPT_LOADER_ADDONS, name)) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("font-kku: unknown addon \"" + name + "\" (looks, motion, fx)");
        }
        return;
      }
      names.push(name);
    });
    return names;
  }

  function loadFromScriptTag(script) {
    if (!script || typeof script.getAttribute !== "function" || !script.src ||
        (script.getAttribute("data-fonts") === null && script.getAttribute("data-addons") === null)) {
      return [];
    }
    var doc = script.ownerDocument || document;
    /* CDN 짧은 주소(`/npm/font-kku@0.4.0`, `unpkg.com/font-kku`)는 파일 이름이 없다 —
     * 패키지 디렉터리로 보고 그 아래에서 푼다. */
    var base = new URL(script.src);
    if (!/\.[cm]?js$/i.test(base.pathname)) {
      base.pathname = base.pathname.replace(/\/?$/, "/");
    }
    var addons = scriptLoaderAddons(script.getAttribute("data-addons") || "");
    var hrefs = [new URL("font-kku.css", base).href].concat(
      scriptLoaderFonts(script.getAttribute("data-fonts") || "").map(function (name) {
        return new URL("profiles/" + name + ".css", base).href;
      }),
      addons.filter(function (name) { return SCRIPT_LOADER_ADDONS[name].css; }).map(function (name) {
        return new URL(SCRIPT_LOADER_ADDONS[name].css, base).href;
      })
    );
    /* data-jamo-sets="sprite-system": 벡터 자소 모듈(profiles/<name>.jamo.js)도 붙인다. */
    var jamoSrcs = scriptLoaderFonts(script.getAttribute("data-jamo-sets") || "").map(function (name) {
      return new URL("profiles/" + name + ".jamo.js", base).href;
    }).concat(addons.filter(function (name) { return SCRIPT_LOADER_ADDONS[name].js; }).map(function (name) {
      return new URL(SCRIPT_LOADER_ADDONS[name].js, base).href;
    }));
    var veil = doc.createElement("style");
    veil.setAttribute("data-font-kku-loader", "");
    veil.textContent = ':where(font-kku, .font-kku) [part="root"] { visibility: hidden; }';
    (doc.head || doc.documentElement).appendChild(veil);
    var pending = hrefs.length + jamoSrcs.length;
    var timer = setTimeout(reveal, SCRIPT_LOADER_REVEAL_MS);
    function reveal() {
      clearTimeout(timer);
      if (veil.parentNode) {
        veil.parentNode.removeChild(veil);
      }
    }
    function settle() {
      pending -= 1;
      if (pending === 0) {
        reveal();
      }
    }
    hrefs.forEach(function (href) {
      loadFont(href, { root: doc }).then(settle, function (error) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn(error.message);
        }
        settle();
      });
    });
    jamoSrcs.forEach(function (src) {
      var tag = doc.createElement("script");
      tag.src = src;
      tag.async = false;
      tag.addEventListener("load", settle);
      tag.addEventListener("error", function () {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("font-kku: script " + src + " failed to load");
        }
        settle();
      });
      (doc.head || doc.documentElement).appendChild(tag);
    });
    return hrefs.concat(jamoSrcs);
  }

  if (typeof document !== "undefined") {
    loadFromScriptTag(document.currentScript);
  }

  /* Consumers that only need the pure text/model APIs can set
   * `globalThis.FontKkuConfig = { bootstrap: false }` before loading the
   * runtime, then call `FontKku.bootstrap(root)` explicitly if needed. */
  if (typeof document !== "undefined" && shouldAutoBootstrap()) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        bootstrap(document);
      }, { once: true });
    } else {
      bootstrap(document);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
