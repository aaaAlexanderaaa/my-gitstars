"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ThemeToggle } from "@/components/theme-toggle"
import { AlertTriangle, BookOpen, Filter, Github, Package } from "lucide-react"

const AUTH_ERRORS: Record<string, string> = {
  auth_failed: "GitHub sign-in did not complete. Please try again.",
}

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    // The OAuth failure redirect lands here with ?error=..., which used to be silent.
    const params = new URLSearchParams(window.location.search)
    const code = params.get("error")
    if (code) setAuthError(AUTH_ERRORS[code] ?? "Sign-in failed. Please try again.")
  }, [])

  useEffect(() => {
    let cancelled = false

    const checkAuth = async () => {
      try {
        const response = await fetch("/auth/user", { credentials: "include" })
        if (!cancelled && response.ok) {
          router.replace("/dashboard/")
          return
        }
      } catch {
        // Not signed in, or the API is unreachable; show the sign-in card either way.
      }
      if (!cancelled) setIsCheckingAuth(false)
    }

    checkAuth()
    return () => {
      cancelled = true
    }
  }, [router])

  const handleGitHubLogin = () => {
    setIsLoading(true)
    window.location.href = "/auth/github"
  }

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4 text-foreground">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-8">
        <div className="space-y-4 text-center">
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/my-gitstars-logo.svg" alt="" className="h-16 w-16" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">my-gitstars</h1>
            <p className="mt-2 text-muted-foreground">
              Organize and track your starred repositories with smart tagging and version management
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 text-sm">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <Filter className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <div className="font-medium">Smart filtering</div>
              <div className="text-muted-foreground">
                Filter by custom tags, languages and topics, with boolean expressions
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <BookOpen className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <div className="font-medium">README &amp; notes</div>
              <div className="text-muted-foreground">Read the docs and keep your own notes without leaving the app</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <Package className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <div className="font-medium">Release tracking</div>
              <div className="text-muted-foreground">Know when a tool you use has shipped a new version</div>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle>Get started</CardTitle>
            <CardDescription>
              Sign in with your GitHub account to start managing your starred repositories
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {authError && (
              <p
                role="alert"
                className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {authError}
              </p>
            )}
            <Button onClick={handleGitHubLogin} disabled={isLoading} className="w-full" size="lg">
              {isLoading ? (
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-primary-foreground" />
              ) : (
                <Github className="mr-2 h-4 w-4" />
              )}
              Continue with GitHub
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">Secure authentication powered by GitHub OAuth</p>
      </div>
    </div>
  )
}
