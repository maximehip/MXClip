import os from 'os'
import { EmbeddedEvent } from '../types/EmbeddedEvent'

// ─── Window parameters ────────────────────────────────────────────────────────

export const WINDOW_DURATION = 120      // fenêtre large pour donner du contexte au LLM
export const WINDOW_STEP = 75           // compromis couverture/vitesse : 19 fenêtres vs 15 (step=90) ou 29 (step=45)
export const SCORE_THRESHOLD = 8        // seuil élevé : seulement les meilleurs moments
export const MIN_GAP_BETWEEN_CLIPS = 60 // secondes minimum entre deux clips après NMS
export const PARALLEL_WINDOWS = Math.max(2, Math.min(4, Math.ceil(os.cpus().length / 4)))
export const PARALLEL_ENCODERS = Math.max(1, Math.min(2, Math.ceil(os.cpus().length / 8)))
export const CLIP_PADDING_AFTER = 1    // secondes de sécurité après le snap de fin
export const MIN_CLIP_DURATION = 8
export const MAX_CLIP_DURATION = 90

// ─── Density / embedding ─────────────────────────────────────────────────────

export const DENSITY_BUCKET_SIZE = 20  // secondes par bucket
export const EMBED_KEEP_RATIO = 0.65   // garder les 65% de fenêtres les plus prometteuses

// ─── Snapping ─────────────────────────────────────────────────────────────────

export const SNAP_START_LOOK_AHEAD = 4   // secondes max pour avancer le début (vers l'avenir)
export const SNAP_START_LOOK_BACK = 0.2  // secondes max pour reculer le début
export const SNAP_END_LOOK_BACK = 3      // secondes max pour reculer la fin (fallback)

// ─── Viral anchors ────────────────────────────────────────────────────────────

export const VIRAL_ANCHORS: string[] = [
    // Conflit / clash / confrontation
    'fight argument clash confrontation heated conflict dispute',
    'dispute bagarre clash confrontation énervement conflit tension',

    // Arrogance / ego / humiliation
    'arrogant overconfident ego disrespect humiliated embarrassed',
    'arrogant prétentieux ego humilié honte rabaissé irrespectueux',

    // Humour / drôle / absurde
    'funny hilarious joke prank laugh ridiculous absurd unexpected reaction',
    'drôle hilarant blague prank fou rire ridicule absurde réaction',

    // Amour / romance / confession
    'love confession kiss romance relationship heartfelt emotional declaration',
    'amour confession aveu bisou romance relation touchant déclaration',

    // Amitié / loyauté / trahison
    'friendship loyalty betrayal support together best friend bond',
    'amitié loyauté trahison soutien ensemble meilleur ami lien',

    // Révélation / secret / scandale
    'reveal secret confession scandal exposed caught lie truth hidden',
    'révélation secret confession scandale démasqué mensonge vérité caché',

    // Émotion / larmes / moment touchant
    'cry tears emotional moving heartbreaking beautiful overwhelming moment',
    'pleurer larmes émotion touchant bouleversant beau moment fort',

    // Victoire / accomplissement / fierté
    'win victory success achievement proud incredible triumph milestone',
    'victoire succès exploit réussite fier incroyable triomphe accomplissement',

    // Inattendu / surprise / twist
    'unexpected surprise twist nobody saw coming shocking plot reveal',
    'inattendu surprise retournement personne ne s attendait choquant révélation',

    // Prise de conscience / leçon de vie
    'life lesson realization wake up call changed perspective truth',
    'leçon de vie prise de conscience réalisation changer de regard vérité',
]

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ScoredWindow {
    windowStart: number
    windowEnd: number
    score: number
    category: 'clash' | 'arrogance' | 'humor' | 'love' | 'friendship' | 'shocking_reveal' | 'emotional_peak' | 'achievement' | 'life_lesson' | 'controversial' | 'none'
    reason: string
    hook: string
    startSeconds: number
    endSeconds: number
}

export interface WindowWithContext {
    start: number
    end: number
    context: string
    audioCount: number
}

export type ValidCategory = ScoredWindow['category']

export const VALID_CATEGORIES: readonly ValidCategory[] = [
    'clash', 'arrogance', 'humor', 'love', 'friendship', 'shocking_reveal',
    'emotional_peak', 'achievement', 'life_lesson', 'controversial', 'none',
] as const

// Re-export for convenience
export type { EmbeddedEvent }
