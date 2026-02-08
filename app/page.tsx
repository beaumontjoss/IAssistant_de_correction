import Link from 'next/link'
import {
  ArrowRight,
  FileText,
  Brain,
  BarChart3,
  Shield,
  Zap,
  Users,
} from 'lucide-react'

export default function HomePage () {
  return (
    <div className="min-h-screen bg-fond-page">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-gradient-to-br from-bleu-france via-[#000091] to-[#1a1a8a]" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-white/3 rounded-full translate-y-1/2 -translate-x-1/3" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <div className="h-12 w-12 rounded-xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center">
              <span className="text-white font-extrabold text-xl">IA</span>
            </div>
            <span className="text-white/80 font-medium text-lg">IAssistant de correction</span>
          </div>

          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur border border-white/20 text-white/90 text-xs font-medium mb-6">
              <Zap className="h-3 w-3" />
              Correction assistée par intelligence artificielle
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight">
              Corrigez vos copies
              <br />
              <span className="text-white/60">en un temps record</span>
            </h1>

            <p className="text-lg text-white/70 mt-6 max-w-lg leading-relaxed">
              Importez vos copies manuscrites, laissez l&apos;IA les transcrire et les évaluer selon votre barème. Gardez toujours le contrôle final.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mt-10">
              <Link
                href="/controles"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-bleu-france font-bold rounded-xl hover:bg-white/90 transition-all duration-200 shadow-lg shadow-black/20 text-base"
              >
                Commencer une correction
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-14">
          <h2 className="text-2xl sm:text-3xl font-bold text-texte-primaire">
            Comment ça fonctionne
          </h2>
          <p className="text-texte-secondaire mt-3 max-w-lg mx-auto">
            Un processus simple en 4 étapes, de l&apos;énoncé à la note finale
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              step: 1,
              icon: FileText,
              title: 'Configuration',
              description: 'Importez l\'énoncé, choisissez la matière et les modèles d\'IA',
            },
            {
              step: 2,
              icon: Brain,
              title: 'Barème IA',
              description: 'L\'IA génère un barème détaillé que vous pouvez ajuster',
            },
            {
              step: 3,
              icon: Users,
              title: 'Transcription',
              description: 'Photographiez les copies, l\'IA transcrit l\'écriture manuscrite',
            },
            {
              step: 4,
              icon: BarChart3,
              title: 'Correction',
              description: 'Correction automatique avec notes détaillées et commentaires',
            },
          ].map((feature) => (
            <div
              key={feature.step}
              className="bg-fond-card rounded-2xl border border-bordure p-6 hover:shadow-md transition-shadow duration-300 group"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl bg-bleu-france text-white flex items-center justify-center font-bold text-sm group-hover:scale-110 transition-transform">
                  {feature.step}
                </div>
                <feature.icon className="h-5 w-5 text-bleu-france" />
              </div>
              <h3 className="text-base font-bold text-texte-primaire mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-texte-secondaire leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust section */}
      <section className="bg-fond-card border-y border-bordure">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Shield,
                title: 'Données protégées',
                description: 'Aucune donnée stockée en ligne. Le nom des élèves ne quitte jamais votre navigateur.',
              },
              {
                icon: Brain,
                title: 'Multi-modèles',
                description: 'Choisissez parmi les meilleurs modèles d\'IA : Claude, GPT, Gemini, Mistral et plus.',
              },
              {
                icon: Zap,
                title: 'Gain de temps',
                description: 'Réduisez le temps de correction tout en gardant le contrôle total sur les notes.',
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-4">
                <div className="h-10 w-10 rounded-lg bg-bleu-france-light flex items-center justify-center flex-shrink-0">
                  <item.icon className="h-5 w-5 text-bleu-france" />
                </div>
                <div>
                  <h3 className="font-bold text-texte-primaire mb-1">{item.title}</h3>
                  <p className="text-sm text-texte-secondaire leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="bg-gradient-to-br from-bleu-france to-[#1a1a8a] rounded-3xl p-10 sm:p-14 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Prêt à gagner du temps ?
          </h2>
          <p className="text-white/70 max-w-md mx-auto mb-8">
            Commencez votre première correction assistée par IA en quelques minutes.
          </p>
          <Link
            href="/controles"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-bleu-france font-bold rounded-xl hover:bg-white/90 transition-all duration-200 shadow-lg shadow-black/20"
          >
            Commencer maintenant
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-bordure bg-fond-card">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-bleu-france flex items-center justify-center">
                <span className="text-white font-bold text-xs">IA</span>
              </div>
              <span className="text-sm font-medium text-texte-primaire">
                IAssistant de correction
              </span>
            </div>
            <p className="text-xs text-texte-secondaire">
              POC — Correction assistée par intelligence artificielle
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
