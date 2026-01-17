"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { VersionTracker } from "@/components/version-tracker"
import { RefreshCw, AlertTriangle, BookOpen } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"

interface Repository {
  id: number
  githubId: number
  name: string
  owner: string
  description: string
  language: string
  stargazersCount: number
  topics: string[]
  customTags: string[]
  starredAt: string
  isFollowed: boolean
  latestVersion?: string
  currentlyUsedVersion?: string
  updateAvailable?: boolean
}

interface RepositoryDetailsModalProps {
  repository: Repository | null
  isOpen: boolean
  onClose: () => void
  readmeContent: string
  isLoadingReadme: boolean
  onRefreshReadme: () => void
  onVersionUpdate: (repoId: number, version: string | null) => void
  onRepositoryUpdate?: (repoId: number, patch: Partial<Repository>) => void
  onRemoveTag: (repoId: number, tag: string) => Promise<void>
  onAddTag: (repoId: number, tag: string) => Promise<void>
}

export function RepositoryDetailsModal({
  repository,
  isOpen,
  onClose,
  readmeContent,
  isLoadingReadme,
  onRefreshReadme,
  onVersionUpdate,
  onRepositoryUpdate,
  onRemoveTag,
  onAddTag,
}: RepositoryDetailsModalProps) {
  const [isEditingTags, setIsEditingTags] = useState(false)
  const [newTag, setNewTag] = useState("")
  const [isUpdatingTags, setIsUpdatingTags] = useState(false)
  const [localRepository, setLocalRepository] = useState(repository)
  const [activeTab, setActiveTab] = useState<"readme" | "versions">("readme")

  // Track the previous repository ID to detect actual repo changes vs. prop updates
  const prevRepoIdRef = useRef<number | null>(null)

  // Update local repository when prop changes (but don't reset tab)
  useEffect(() => {
    setLocalRepository(repository)
  }, [repository])

  // Reset tab only when repository ID actually changes (not on every prop update)
  useEffect(() => {
    const currentId = repository?.id ?? null
    if (prevRepoIdRef.current !== null && prevRepoIdRef.current !== currentId) {
      // ID changed - reset to readme tab
      setActiveTab("readme")
    }
    prevRepoIdRef.current = currentId
  }, [repository?.id])

  const handleRepositoryMetaUpdate = useCallback((repoId: number, patch: Partial<Repository>) => {
    setLocalRepository((currentRepository) => {
      if (!currentRepository || currentRepository.id !== repoId) return currentRepository
      const merged = { ...currentRepository, ...patch }
      const latestVersion = merged.latestVersion
      const currentVersion = merged.currentlyUsedVersion
      const updateAvailable = !!(latestVersion && currentVersion && currentVersion !== latestVersion)
      return { ...merged, updateAvailable }
    })
    onRepositoryUpdate?.(repoId, patch)
  }, [onRepositoryUpdate])

  // Handle version update locally
  const handleVersionUpdate = useCallback((repoId: number, version: string | null) => {
    setLocalRepository((currentRepository) => {
      if (!currentRepository || currentRepository.id !== repoId) return currentRepository
      return {
        ...currentRepository,
        currentlyUsedVersion: version,
        updateAvailable: version && currentRepository.latestVersion ? version !== currentRepository.latestVersion : false,
      }
    })
    onVersionUpdate?.(repoId, version)
  }, [onVersionUpdate])

  if (!localRepository) return null

  const handleAddTag = async () => {
    if (!newTag.trim()) return

    setIsUpdatingTags(true)
    try {
      await onAddTag(localRepository.id, newTag.trim())
      setNewTag("")
      setIsEditingTags(false)
    } catch (error) {
      console.error("Failed to add tag:", error)
    } finally {
      setIsUpdatingTags(false)
    }
  }

  const handleRemoveTag = async (tag: string) => {
    setIsUpdatingTags(true)
    try {
      await onRemoveTag(localRepository.id, tag)
    } catch (error) {
      console.error("Failed to remove tag:", error)
    } finally {
      setIsUpdatingTags(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-6xl w-[95vw] h-[90vh] overflow-hidden flex flex-col"
        aria-describedby="repository-details-description"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="truncate">
              {localRepository.owner}/{localRepository.name}
            </span>
            {localRepository.updateAvailable && (
              <Badge className="text-xs bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Update Available
              </Badge>
            )}
          </DialogTitle>
          <div id="repository-details-description" className="sr-only">
            Repository details for {localRepository.owner}/{localRepository.name}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "readme" | "versions")} className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-2 shrink-0">
              <TabsTrigger value="readme">README</TabsTrigger>
              <TabsTrigger value="versions">Changelog</TabsTrigger>
            </TabsList>

            <TabsContent value="readme" className="flex-1 overflow-hidden mt-0" style={{ minHeight: 0 }}>
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    README.md
                  </h4>
                  <Button onClick={onRefreshReadme} disabled={isLoadingReadme} variant="outline" size="sm">
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingReadme ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>

                {isLoadingReadme ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : readmeContent ? (
                  <div className="bg-white dark:bg-gray-900 border rounded-lg overflow-hidden shadow-sm flex-1 flex flex-col">
                    <div className="p-6 overflow-y-auto flex-1">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[
                          rehypeRaw,
                          [rehypeSanitize, {
                            ...defaultSchema,
                            tagNames: [
                              ...(defaultSchema.tagNames || []),
                              'img', 'a', 'hr', 'div', 'span', 'center', 'br', 'sup', 'sub'
                            ],
                            attributes: {
                              ...defaultSchema.attributes,
                              img: ['src', 'alt', 'title', 'width', 'height', 'align'],
                              a: ['href', 'title', 'target', 'rel'],
                              div: ['align', 'style'],
                              span: ['style'],
                              '*': ['className']
                            }
                          }]
                        ]}
                        components={{
                          h1: ({ children, ...props }) => (
                            <h1
                              className="text-3xl font-bold mb-6 mt-8 first:mt-0 text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2"
                              {...props}
                            >
                              {children}
                            </h1>
                          ),
                          h2: ({ children, ...props }) => (
                            <h2 className="text-2xl font-semibold mb-4 mt-6 text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-1" {...props}>
                              {children}
                            </h2>
                          ),
                          h3: ({ children, ...props }) => (
                            <h3 className="text-xl font-semibold mb-3 mt-5 text-gray-900 dark:text-gray-100" {...props}>
                              {children}
                            </h3>
                          ),
                          h4: ({ children, ...props }) => (
                            <h4 className="text-lg font-semibold mb-2 mt-4 text-gray-900 dark:text-gray-100" {...props}>
                              {children}
                            </h4>
                          ),
                          h5: ({ children, ...props }) => (
                            <h5 className="text-base font-semibold mb-2 mt-3 text-gray-900 dark:text-gray-100" {...props}>
                              {children}
                            </h5>
                          ),
                          h6: ({ children, ...props }) => (
                            <h6 className="text-sm font-semibold mb-2 mt-3 text-gray-900 dark:text-gray-100" {...props}>
                              {children}
                            </h6>
                          ),
                          p: ({ children, ...props }) => (
                            <p className="mb-4 text-gray-800 dark:text-gray-200 leading-relaxed" {...props}>
                              {children}
                            </p>
                          ),
                          a: ({ href, children, ...props }) => {
                            const isExternal = href && (href.startsWith('http') || href.startsWith('https'))
                            const isEmail = href && href.startsWith('mailto:')
                            
                            return (
                              <a
                                href={href}
                                target={isExternal ? "_blank" : "_self"}
                                rel={isExternal ? "noopener noreferrer" : undefined}
                                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline decoration-1 underline-offset-2 hover:decoration-2 transition-all"
                                {...props}
                              >
                                {children}
                              </a>
                            )
                          },
                          img: ({ src, alt, ...props }) => {
                            // Handle relative image URLs for GitHub repositories
                            let imageSrc = src || "/placeholder.svg"
                            
                            if (localRepository && src && !src.startsWith('http') && !src.startsWith('data:')) {
                              // Convert relative URLs to GitHub raw URLs
                              const baseUrl = `https://raw.githubusercontent.com/${localRepository.owner}/${localRepository.name}/main/`
                              imageSrc = src.startsWith('./') ? baseUrl + src.slice(2) : 
                                        src.startsWith('/') ? baseUrl + src.slice(1) : 
                                        baseUrl + src
                            }
                            
                            return (
                              <img
                                src={imageSrc}
                                alt={alt || "Repository image"}
                                loading="lazy"
                                className="max-w-full h-auto rounded border border-gray-200 dark:border-gray-700 my-4"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement
                                  target.style.display = "none"
                                }}
                                {...props}
                              />
                            )
                          },
                          ul: ({ children, ...props }) => (
                            <ul className="mb-4 ml-6 list-disc space-y-1" {...props}>
                              {children}
                            </ul>
                          ),
                          ol: ({ children, ...props }) => (
                            <ol className="mb-4 ml-6 list-decimal space-y-1" {...props}>
                              {children}
                            </ol>
                          ),
                          li: ({ children, ...props }) => (
                            <li className="text-gray-800 dark:text-gray-200 leading-relaxed" {...props}>
                              {children}
                            </li>
                          ),
                          pre: ({ children, ...props }) => (
                            <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto border border-gray-200 dark:border-gray-700 mb-4 text-sm text-gray-900 dark:text-gray-100" {...props}>
                              {children}
                            </pre>
                          ),
                          code: ({ children, className, ...props }) => {
                            const isInline = !className
                            return isInline ? (
                              <code
                                className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700"
                                {...props}
                              >
                                {children}
                              </code>
                            ) : (
                              <code className="text-sm font-mono text-gray-900 dark:text-gray-100" {...props}>
                                {children}
                              </code>
                            )
                          },
                          table: ({ children, ...props }) => (
                            <div className="overflow-x-auto mb-4">
                              <table className="min-w-full border-collapse border border-gray-200 dark:border-gray-700 rounded-lg" {...props}>
                                {children}
                              </table>
                            </div>
                          ),
                          thead: ({ children, ...props }) => (
                            <thead className="bg-gray-50 dark:bg-gray-800" {...props}>
                              {children}
                            </thead>
                          ),
                          th: ({ children, ...props }) => (
                            <th
                              className="border border-gray-200 dark:border-gray-700 px-4 py-3 font-semibold text-left text-gray-900 dark:text-gray-100"
                              {...props}
                            >
                              {children}
                            </th>
                          ),
                          td: ({ children, ...props }) => (
                            <td className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-gray-800 dark:text-gray-200" {...props}>
                              {children}
                            </td>
                          ),
                          blockquote: ({ children, ...props }) => (
                            <blockquote
                              className="border-l-4 border-blue-500 dark:border-blue-400 pl-4 py-2 mb-4 bg-blue-50 dark:bg-blue-900/20 italic text-gray-800 dark:text-gray-200"
                              {...props}
                            >
                              {children}
                            </blockquote>
                          ),
                          hr: ({ ...props }) => <hr className="my-6 border-gray-200 dark:border-gray-700" {...props} />,
                          // Custom handling for inline HTML elements that are common in GitHub markdown
                          span: ({ children, ...props }) => (
                            <span className="text-gray-800 dark:text-gray-200" {...props}>
                              {children}
                            </span>
                          ),
                          div: ({ children, ...props }) => (
                            <div className="text-gray-800 dark:text-gray-200" {...props}>
                              {children}
                            </div>
                          ),
                          strong: ({ children, ...props }) => (
                            <strong className="font-semibold text-gray-900 dark:text-gray-100" {...props}>
                              {children}
                            </strong>
                          ),
                          em: ({ children, ...props }) => (
                            <em className="italic text-gray-800 dark:text-gray-200" {...props}>
                              {children}
                            </em>
                          ),
                        }}
                      >
                        {readmeContent}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No README found for this repository</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="versions" className="flex-1 overflow-hidden mt-0" style={{ minHeight: 0 }}>
              <div className="flex flex-col h-full">
                {activeTab === "versions" ? (
                  <VersionTracker
                    repository={localRepository}
                    onVersionUpdate={handleVersionUpdate}
                    onRepositoryMetaUpdate={handleRepositoryMetaUpdate}
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">Select the "Changelog" tab to load releases.</div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
