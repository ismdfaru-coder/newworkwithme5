"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { 
  Plus, 
  ArrowUp,
  Presentation, 
  Globe, 
  Smartphone, 
  Paintbrush,
  Smile,
  Mic,
  X,
  Loader2,
  Copy,
  Check,
  RotateCcw,
  ExternalLink,
  FileText,
  Code,
  Sparkles,
  Monitor,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  status?: "pending" | "browsing" | "processing" | "completed" | "error"
  taskId?: string
  steps?: TaskStep[]
  artifacts?: Artifact[]
}

interface TaskStep {
  id: string
  type: "thinking" | "browsing" | "searching" | "analyzing" | "writing" | "complete"
  description: string
  timestamp: Date
}

interface Artifact {
  id: string
  type: "document" | "code" | "website" | "file"
  title: string
  content?: string
  url?: string
}

interface ManusResponse {
  id?: string
  task_id?: string
  taskId?: string
  status?: string
  result?: string | object | Array<{ id?: string; status?: string; role?: string; type?: string; content?: string }>
  output?: string | object | Array<{ id?: string; status?: string; role?: string; type?: string; content?: string }>
  message?: string
  error?: string
  steps?: Array<{
    type: string
    description: string
  }>
  artifacts?: Array<{
    type: string
    title: string
    content?: string | object
    url?: string
  }>
}

// Helper function to extract string content from various response formats
const extractContent = (data: ManusResponse): string => {
  console.log("[v0] Agent extractContent - keys:", Object.keys(data))
  
  // Check for result field
  if (data.result !== undefined && data.result !== null) {
    console.log("[v0] Found result field, type:", typeof data.result)
    if (typeof data.result === 'string') return data.result
    if (typeof data.result === 'object') {
      // Handle array of message objects
      if (Array.isArray(data.result)) {
        console.log("[v0] Result is array with", data.result.length, "items")
        // Try to find assistant messages with content
        const assistantContent = data.result
          .filter((item) => item.role === 'assistant' && item.content)
          .map((item) => item.content)
          .join('\n\n')
        if (assistantContent) return assistantContent
        
        // If no assistant messages, try all items with content
        const allContent = data.result
          .filter((item) => item.content)
          .map((item) => item.content)
          .join('\n\n')
        if (allContent) return allContent
      }
      // Handle single message object with various content fields
      const resultObj = data.result as Record<string, unknown>
      console.log("[v0] Result object keys:", Object.keys(resultObj))
      if (resultObj.content && typeof resultObj.content === 'string') return resultObj.content
      if (resultObj.text && typeof resultObj.text === 'string') return resultObj.text
      if (resultObj.message && typeof resultObj.message === 'string') return resultObj.message
      if (resultObj.data && typeof resultObj.data === 'string') return resultObj.data
      // Last resort - stringify the object but exclude metadata
      const { id, status, role, type, ...contentFields } = resultObj
      if (Object.keys(contentFields).length > 0) {
        return JSON.stringify(contentFields, null, 2)
      }
    }
  }
  
  // Check for output field
  if (data.output !== undefined && data.output !== null) {
    console.log("[v0] Found output field, type:", typeof data.output)
    if (typeof data.output === 'string') return data.output
    if (typeof data.output === 'object') {
      if (Array.isArray(data.output)) {
        const assistantContent = data.output
          .filter((item) => item.role === 'assistant' && item.content)
          .map((item) => item.content)
          .join('\n\n')
        if (assistantContent) return assistantContent
        
        const allContent = data.output
          .filter((item) => item.content)
          .map((item) => item.content)
          .join('\n\n')
        if (allContent) return allContent
      }
      const outputObj = data.output as Record<string, unknown>
      if (outputObj.content && typeof outputObj.content === 'string') return outputObj.content
      if (outputObj.text && typeof outputObj.text === 'string') return outputObj.text
      if (outputObj.data && typeof outputObj.data === 'string') return outputObj.data
    }
  }
  
  // Fallback to message
  if (data.message && typeof data.message === 'string') return data.message
  
  // Ultimate fallback - return stringified data (excluding known metadata)
  const { id, task_id, taskId, status, steps, artifacts, error, ...remaining } = data
  if (Object.keys(remaining).length > 0) {
    console.log("[v0] Using fallback, remaining keys:", Object.keys(remaining))
    return JSON.stringify(remaining, null, 2)
  }
  
  return "No content received from API"
}

export default function AgentsPage() {
  const [inputValue, setInputValue] = useState("")
  const [showToolsBar, setShowToolsBar] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [pollingTaskId, setPollingTaskId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const quickActions = [
    { icon: Presentation, label: "Create slides" },
    { icon: Globe, label: "Build website" },
    { icon: Smartphone, label: "Develop apps" },
    { icon: Paintbrush, label: "Design" },
  ]

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [])

  const pollTaskStatus = useCallback(async (taskId: string, messageId: string) => {
    try {
      const response = await fetch(`/api/manus?taskId=${taskId}`)
      const data: ManusResponse = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch task status")
      }

      const status = data.status?.toLowerCase()

      // Check if task is complete
      if (status === "completed" || status === "done" || status === "finished" || status === "success" || data.result || data.output) {
        // Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
        setPollingTaskId(null)
        setIsLoading(false)

        const responseContent = extractContent(data)
        
        const artifacts: Artifact[] = (data.artifacts || []).map((a, i) => ({
          id: crypto.randomUUID(),
          type: a.type as Artifact["type"] || "document",
          title: a.title || `Artifact ${i + 1}`,
          content: typeof a.content === 'string' ? a.content : JSON.stringify(a.content),
          url: a.url,
        }))

        setMessages(prev => prev.map(m => 
          m.id === messageId 
            ? { 
                ...m, 
                content: responseContent,
                status: "completed",
                steps: [
                  ...(m.steps || []),
                  {
                    id: crypto.randomUUID(),
                    type: "complete",
                    description: "Task completed successfully",
                    timestamp: new Date(),
                  }
                ],
                artifacts: artifacts.length > 0 ? artifacts : undefined,
              }
            : m
        ))
      } else if (status === "failed" || status === "error") {
        // Stop polling on error
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
        setPollingTaskId(null)
        setIsLoading(false)

        setMessages(prev => prev.map(m => 
          m.id === messageId 
            ? { 
                ...m, 
                content: data.error || data.message || "Task failed",
                status: "error",
                steps: [
                  ...(m.steps || []),
                  {
                    id: crypto.randomUUID(),
                    type: "complete",
                    description: "Task failed",
                    timestamp: new Date(),
                  }
                ]
              }
            : m
        ))
      }
      // If still processing, continue polling (do nothing here)
    } catch (error) {
      console.error("Error polling task status:", error)
    }
  }, [])

  const handleSubmit = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    }

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
      status: "pending",
      steps: [
        {
          id: crypto.randomUUID(),
          type: "thinking",
          description: "Understanding your request...",
          timestamp: new Date(),
        }
      ]
    }

    setMessages(prev => [...prev, userMessage, assistantMessage])
    setInputValue("")
    setIsLoading(true)

    try {
      // Update to browsing status for agent mode
      setMessages(prev => prev.map(m => 
        m.id === assistantMessage.id 
          ? { 
              ...m, 
              status: "browsing",
              steps: [
                ...(m.steps || []),
                {
                  id: crypto.randomUUID(),
                  type: "browsing",
                  description: "Browsing...",
                  timestamp: new Date(),
                }
              ]
            }
          : m
      ))

      const response = await fetch("/api/manus", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          prompt: userMessage.content,
          taskMode: "agent"
        }),
      })

      const data: ManusResponse = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.message || "Failed to get response")
      }

      // Get task ID for polling
      const taskId = data.task_id || data.taskId || data.id

      if (taskId) {
        // Update message with task ID
        setMessages(prev => prev.map(m => 
          m.id === assistantMessage.id 
            ? { 
                ...m, 
                taskId,
                status: "browsing",
                steps: [
                  ...(m.steps || []),
                  {
                    id: crypto.randomUUID(),
                    type: "searching",
                    description: "Agent is working on your task...",
                    timestamp: new Date(),
                  }
                ]
              }
            : m
        ))

        // Start polling for task status
        setPollingTaskId(taskId)
        pollingIntervalRef.current = setInterval(() => {
          pollTaskStatus(taskId, assistantMessage.id)
        }, 3000) // Poll every 3 seconds

        // Also do an immediate check
        await pollTaskStatus(taskId, assistantMessage.id)
      } else {
        // If no task ID, treat as immediate response
        const responseContent = extractContent(data)
        
        const artifacts: Artifact[] = (data.artifacts || []).map((a, i) => ({
          id: crypto.randomUUID(),
          type: a.type as Artifact["type"] || "document",
          title: a.title || `Artifact ${i + 1}`,
          content: typeof a.content === 'string' ? a.content : JSON.stringify(a.content),
          url: a.url,
        }))

        setMessages(prev => prev.map(m => 
          m.id === assistantMessage.id 
            ? { 
                ...m, 
                content: responseContent,
                status: "completed",
                steps: [
                  ...(m.steps || []),
                  {
                    id: crypto.randomUUID(),
                    type: "complete",
                    description: "Task completed successfully",
                    timestamp: new Date(),
                  }
                ],
                artifacts: artifacts.length > 0 ? artifacts : undefined,
              }
            : m
        ))
        setIsLoading(false)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred"
      setMessages(prev => prev.map(m => 
        m.id === assistantMessage.id 
          ? { 
              ...m, 
              content: errorMessage,
              status: "error",
              steps: [
                ...(m.steps || []),
                {
                  id: crypto.randomUUID(),
                  type: "complete",
                  description: "Task failed",
                  timestamp: new Date(),
                }
              ]
            }
          : m
      ))
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleCopy = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleRetry = (messageId: string) => {
    // Stop any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    setPollingTaskId(null)

    const messageIndex = messages.findIndex(m => m.id === messageId)
    if (messageIndex > 0) {
      const userMessage = messages[messageIndex - 1]
      if (userMessage.role === "user") {
        setInputValue(userMessage.content)
        setMessages(prev => prev.slice(0, messageIndex - 1))
      }
    }
  }

  const handleQuickAction = (action: string) => {
    setInputValue(action)
    textareaRef.current?.focus()
  }

  const getStepIcon = (type: TaskStep["type"], isLast: boolean) => {
    if (!isLast || type === "complete") {
      switch (type) {
        case "thinking":
          return <Sparkles className="h-3 w-3 text-blue-500" />
        case "browsing":
          return <Monitor className="h-3 w-3 text-cyan-500" />
        case "searching":
          return <Globe className="h-3 w-3 text-green-500" />
        case "analyzing":
          return <Code className="h-3 w-3 text-orange-500" />
        case "writing":
          return <FileText className="h-3 w-3 text-purple-500" />
        case "complete":
          return <Check className="h-3 w-3 text-green-500" />
        default:
          return <Sparkles className="h-3 w-3" />
      }
    }
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
  }

  const getArtifactIcon = (type: Artifact["type"]) => {
    switch (type) {
      case "document":
        return <FileText className="h-4 w-4" />
      case "code":
        return <Code className="h-4 w-4" />
      case "website":
        return <Globe className="h-4 w-4" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  // Show chat view if there are messages
  if (messages.length > 0) {
    return (
      <div className="flex h-full flex-col">
        {/* Messages Area */}
        <div className="flex-1 overflow-auto px-4 py-6">
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-4",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600">
                    <Monitor className="h-4 w-4 text-white" />
                  </div>
                )}
                
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-3",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  {/* Processing Steps - Show "Browsing" for agent mode */}
                  {message.role === "assistant" && message.steps && message.status !== "completed" && message.status !== "error" && (
                    <div className="mb-3 space-y-2">
                      {message.status === "browsing" && (
                        <div className="flex items-center gap-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3">
                          <div className="relative">
                            <Monitor className="h-5 w-5 text-cyan-500" />
                            <span className="absolute -right-1 -top-1 flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75"></span>
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500"></span>
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300">Browsing</p>
                            <p className="text-xs text-muted-foreground">Agent is browsing the web for your task...</p>
                          </div>
                        </div>
                      )}
                      {message.steps.filter(s => s.type !== "browsing").map((step, index) => (
                        <div
                          key={step.id}
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                          {getStepIcon(step.type, index === (message.steps?.filter(s => s.type !== "browsing").length || 0) - 1)}
                          <span>{step.description}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Message Content */}
                  {message.content && (
                    <div className={cn(
                      "prose prose-sm dark:prose-invert max-w-none",
                      message.status === "error" && "text-destructive"
                    )}>
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                  )}

                  {/* Artifacts */}
                  {message.artifacts && message.artifacts.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {message.artifacts.map((artifact) => (
                        <div
                          key={artifact.id}
                          className="flex items-center gap-3 rounded-lg border border-border bg-background p-3"
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                            {getArtifactIcon(artifact.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{artifact.title}</p>
                            <p className="text-xs text-muted-foreground capitalize">{artifact.type}</p>
                          </div>
                          {artifact.url && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                              <a href={artifact.url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions for assistant messages */}
                  {message.role === "assistant" && message.status === "completed" && (
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => handleCopy(message.content, message.id)}
                      >
                        {copiedId === message.id ? (
                          <>
                            <Check className="h-3 w-3" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Copy
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => handleRetry(message.id)}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Retry
                      </Button>
                    </div>
                  )}

                  {/* Error state */}
                  {message.status === "error" && (
                    <div className="mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => handleRetry(message.id)}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Try again
                      </Button>
                    </div>
                  )}
                </div>

                {message.role === "user" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-500">
                    <span className="text-sm font-medium text-white">U</span>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="border-t border-border bg-background p-4">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Assign another task..."
                className="min-h-[40px] w-full resize-none bg-transparent text-base outline-none placeholder:text-muted-foreground"
                rows={1}
                disabled={isLoading}
              />

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground">
                    <Smile className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground">
                    <Mic className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    className={cn(
                      "h-10 w-10 rounded-full",
                      inputValue.trim() && !isLoading
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                    disabled={!inputValue.trim() || isLoading}
                    onClick={handleSubmit}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowUp className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Initial view with prompt
  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <h1 className="mb-8 text-xl font-semibold">Agents</h1>

      {/* Main Heading */}
      <h2 className="mb-12 text-center font-serif text-4xl md:text-5xl">
        What can I do for you?
      </h2>

      {/* Input Area */}
      <div className="w-full max-w-3xl">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Assign a task or ask anything"
            className="min-h-[60px] w-full resize-none bg-transparent text-base outline-none placeholder:text-muted-foreground"
            rows={2}
            disabled={isLoading}
          />

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground">
                <Plus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground">
                <HandIcon />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground">
                <SettingsIcon />
              </Button>
            </div>

            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground">
                <Smile className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground">
                <Mic className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                className={cn(
                  "h-10 w-10 rounded-full",
                  inputValue.trim() && !isLoading
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
                disabled={!inputValue.trim() || isLoading}
                onClick={handleSubmit}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Tools Connection Bar */}
        {showToolsBar && (
          <div className="mt-2 flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2">
            <div className="flex items-center gap-2">
              <ConnectIcon />
              <span className="text-sm text-muted-foreground">Powered by Manus AI Agent</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <ToolIcon type="chatgpt" />
                <ToolIcon type="gmail" />
                <ToolIcon type="sheets" />
                <ToolIcon type="slack" />
                <ToolIcon type="github" />
                <ToolIcon type="notion" />
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => setShowToolsBar(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {quickActions.map((action) => (
            <Button
              key={action.label}
              variant="outline"
              className="gap-2 rounded-full border-border bg-background hover:bg-muted"
              onClick={() => handleQuickAction(`Help me ${action.label.toLowerCase()}`)}
            >
              <action.icon className="h-4 w-4" />
              {action.label}
            </Button>
          ))}
          <Button 
            variant="outline" 
            className="rounded-full border-border bg-background hover:bg-muted"
            onClick={() => handleQuickAction("Find the best flights from Glasgow to Chennai")}
          >
            More
          </Button>
        </div>
      </div>
    </div>
  )
}

function HandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
      <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function ConnectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function ToolIcon({ type }: { type: string }) {
  const icons: Record<string, React.ReactNode> = {
    chatgpt: (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#10a37f]">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
          <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.6 8.3829l2.02-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.1408 1.6465 4.4708 4.4708 0 0 1 .4246 3.0137zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
        </svg>
      </div>
    ),
    gmail: (
      <div className="flex h-5 w-5 items-center justify-center rounded text-red-500">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
        </svg>
      </div>
    ),
    sheets: (
      <div className="flex h-5 w-5 items-center justify-center rounded text-green-600">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.385 1.848H4.615A2.769 2.769 0 0 0 1.846 4.62v14.77a2.769 2.769 0 0 0 2.769 2.769h14.77a2.769 2.769 0 0 0 2.769-2.769V4.62a2.769 2.769 0 0 0-2.769-2.77zM7.385 18.465H4.615v-2.77h2.77zm0-4.616H4.615v-2.77h2.77zm0-4.615H4.615v-2.77h2.77zm5.538 9.231H8.308v-2.77h4.615zm0-4.616H8.308v-2.77h4.615zm0-4.615H8.308v-2.77h4.615zm6.462 9.231h-4.616v-2.77h4.616zm0-4.616h-4.616v-2.77h4.616zm0-4.615h-4.616v-2.77h4.616z"/>
        </svg>
      </div>
    ),
    slack: (
      <div className="flex h-5 w-5 items-center justify-center">
        <svg width="14" height="14" viewBox="0 0 24 24">
          <path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"/>
          <path fill="#36C5F0" d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"/>
          <path fill="#2EB67D" d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"/>
          <path fill="#ECB22E" d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
        </svg>
      </div>
    ),
    github: (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-black text-white">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
      </div>
    ),
    notion: (
      <div className="flex h-5 w-5 items-center justify-center">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.746c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.449.327s0 .84-1.168.84l-3.22.186c-.094-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"/>
        </svg>
      </div>
    ),
  }
  return icons[type] || null
}
