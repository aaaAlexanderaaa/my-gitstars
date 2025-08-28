"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Github, Star, Filter, BookOpen } from "lucide-react"

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const router = useRouter()

  // Check if user is already authenticated
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/auth/user", {
          credentials: "include",
        })
        if (response.ok) {
          router.push("/dashboard")
          return
        }
      } catch (error) {
        console.log("User not authenticated")
      } finally {
        setIsCheckingAuth(false)
      }
    }

    checkAuth()
  }, [router])

  const handleGitHubLogin = () => {
    setIsLoading(true)
    window.location.href = "/auth/github"
  }

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md space-y-8">
        {/* App Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-3 bg-primary rounded-full">
              <Star className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">GitHub Star Manager</h1>
            <p className="text-muted-foreground mt-2">
              Organize and track your starred repositories with smart tagging and version management
            </p>
          </div>
        </div>

        {/* Features Preview */}
        <div className="grid grid-cols-1 gap-4 text-sm">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-gray-200">
            <Filter className="h-5 w-5 text-primary" />
            <div>
              <div className="font-medium">Smart Filtering</div>
              <div className="text-muted-foreground">Filter by custom tags, languages, and topics</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-gray-200">
            <BookOpen className="h-5 w-5 text-primary" />
            <div>
              <div className="font-medium">README Preview</div>
              <div className="text-muted-foreground">View repository details without leaving the app</div>
            </div>
          </div>
        </div>

        {/* Login Card */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Get Started</CardTitle>
            <CardDescription>
              Sign in with your GitHub account to start managing your starred repositories
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleGitHubLogin} disabled={isLoading} className="w-full" size="lg">
              {isLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2"></div>
              ) : (
                <Github className="mr-2 h-4 w-4" />
              )}
              Continue with GitHub
            </Button>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground">Secure authentication powered by GitHub OAuth</p>
      </div>
    </div>
  )
}
