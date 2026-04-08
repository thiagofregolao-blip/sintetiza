'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { register, login, getWhatsappStatus } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function validate(): string | null {
    if (!name.trim()) return 'Nome é obrigatório.';
    if (!email.includes('@') || !email.includes('.')) return 'E-mail inválido.';
    if (password.length < 6) return 'A senha deve ter pelo menos 6 caracteres.';
    if (password !== confirmPassword) return 'As senhas não coincidem.';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      await register({ name, email, password });
      const res = await login({ email, password });
      localStorage.setItem('access_token', res.access_token);
      localStorage.setItem('refresh_token', res.refresh_token);

      // Check WA session
      try {
        const status = await getWhatsappStatus();
        if (status?.connected) {
          router.push('/dashboard');
        } else {
          router.push('/onboarding/connect');
        }
      } catch {
        router.push('/onboarding/connect');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao criar conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden md:flex md:w-1/2 relative bg-[#060e20] flex-col justify-center px-16 overflow-hidden">
        {/* Background blurs */}
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-[#25d366]/15 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-56 h-56 bg-[#72d8c8]/10 rounded-full blur-[80px]" />

        <div className="relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-2 mb-12">
            <span className="material-symbols-outlined text-3xl bg-gradient-to-r from-[#4ff07f] to-[#25d366] bg-clip-text text-transparent">
              bolt
            </span>
            <span className="text-3xl font-bold bg-gradient-to-r from-[#4ff07f] to-[#25d366] bg-clip-text text-transparent">
              ZapDigest
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-3xl lg:text-4xl font-bold leading-tight mb-4 text-[#dae2fd]">
            Inteligência Editorial para Líderes de Alto Impacto.
          </h1>
          <p className="text-[#bbcbb9] mb-12 max-w-md leading-relaxed">
            Transforme o caos das conversas em insights estratégicos. Tome decisões melhores com informação curada por IA.
          </p>

          {/* Feature items */}
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#222a3d] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[#4ff07f]">verified</span>
              </div>
              <div>
                <p className="font-semibold text-[#dae2fd] mb-1">Dados criptografados</p>
                <p className="text-sm text-[#bbcbb9]">Sua privacidade protegida com criptografia de ponta a ponta.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#222a3d] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[#4ff07f]">speed</span>
              </div>
              <div>
                <p className="font-semibold text-[#dae2fd] mb-1">Resumos em segundos</p>
                <p className="text-sm text-[#bbcbb9]">Receba digests instantâneos com os pontos mais relevantes.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="w-full md:w-1/2 bg-[#0b1326] flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-10 md:hidden">
            <span className="material-symbols-outlined text-2xl bg-gradient-to-r from-[#4ff07f] to-[#25d366] bg-clip-text text-transparent">
              bolt
            </span>
            <span className="text-xl font-bold bg-gradient-to-r from-[#4ff07f] to-[#25d366] bg-clip-text text-transparent">
              ZapDigest
            </span>
          </div>

          {/* Heading */}
          <h2 className="text-2xl font-bold mb-2 text-[#dae2fd]">Crie sua conta.</h2>
          <p className="text-sm text-[#bbcbb9] mb-8">Comece a transformar suas conversas em insights.</p>

          {/* Tabs */}
          <div className="flex rounded-xl bg-[#131b2e] p-1 mb-8">
            <Link
              href="/auth/login"
              className="flex-1 py-2.5 text-sm font-semibold rounded-lg text-[#bbcbb9] text-center hover:text-[#dae2fd] transition-colors"
            >
              Entrar
            </Link>
            <button className="flex-1 py-2.5 text-sm font-semibold rounded-lg bg-[#2d3449] text-[#dae2fd]">
              Criar conta
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-[#93000a]/20 border border-[#ffb4ab]/20 text-sm text-[#ffb4ab]">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div>
              <label className="block text-[0.6875rem] font-semibold uppercase tracking-widest text-[#bbcbb9] mb-2">
                Nome completo
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Seu nome"
                className="w-full bg-[#060e20] border-none rounded-xl py-4 px-5 text-sm text-[#dae2fd] placeholder:text-[#bbcbb9]/40 focus:outline-none focus:ring-2 focus:ring-[#4ff07f]/30"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-[0.6875rem] font-semibold uppercase tracking-widest text-[#bbcbb9] mb-2">
                E-mail corporativo
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
                className="w-full bg-[#060e20] border-none rounded-xl py-4 px-5 text-sm text-[#dae2fd] placeholder:text-[#bbcbb9]/40 focus:outline-none focus:ring-2 focus:ring-[#4ff07f]/30"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[0.6875rem] font-semibold uppercase tracking-widest text-[#bbcbb9] mb-2">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-[#060e20] border-none rounded-xl py-4 px-5 pr-12 text-sm text-[#dae2fd] placeholder:text-[#bbcbb9]/40 focus:outline-none focus:ring-2 focus:ring-[#4ff07f]/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#bbcbb9] hover:text-[#dae2fd]"
                >
                  <span className="material-symbols-outlined text-xl">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-[0.6875rem] font-semibold uppercase tracking-widest text-[#bbcbb9] mb-2">
                Confirmar senha
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Repita sua senha"
                  className="w-full bg-[#060e20] border-none rounded-xl py-4 px-5 pr-12 text-sm text-[#dae2fd] placeholder:text-[#bbcbb9]/40 focus:outline-none focus:ring-2 focus:ring-[#4ff07f]/30"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#bbcbb9] hover:text-[#dae2fd]"
                >
                  <span className="material-symbols-outlined text-xl">
                    {showConfirmPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-[#4ff07f] to-[#25d366] text-[#005523] font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {loading ? 'Criando conta...' : 'Criar conta grátis'}
              {!loading && <span className="material-symbols-outlined text-lg">arrow_forward</span>}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-[#222a3d]" />
            <span className="text-xs text-[#bbcbb9]">ou continue com</span>
            <div className="flex-1 h-px bg-[#222a3d]" />
          </div>

          {/* Google Login */}
          <button className="w-full py-3.5 rounded-xl border border-[#222a3d] flex items-center justify-center gap-3 text-sm font-medium text-[#dae2fd] hover:bg-[#131b2e] transition-colors">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continuar com Google
          </button>

          {/* Footer link */}
          <p className="text-center text-sm text-[#bbcbb9] mt-8">
            Já tem conta?{' '}
            <Link href="/auth/login" className="text-[#4ff07f] font-semibold hover:underline">
              Fazer login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
