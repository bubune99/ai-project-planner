"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { Trigger } from "@radix-ui/react-select";
import type { UIMessage } from "ai";
import equal from "fast-deep-equal";
import {
  type ChangeEvent,
  type Dispatch,
  memo,
  type SetStateAction,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Brain, BookOpenText, Paperclip } from "lucide-react";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import { saveChatModelAsCookie } from "@/app/chat/actions";
import { SelectItem } from "@/components/chatsdk/ui/select";
import { chatModels } from "@/lib/chatsdk/ai/models";
import type { Attachment, ChatMessage } from "@/lib/chatsdk/types";
import type { AppUsage } from "@/lib/chatsdk/usage";
import { cn } from "@/lib/chatsdk/utils";
import { Context } from "./elements/context";
import { HoldToTalk } from "./hold-to-talk";
import { ASK_EVENT, QUOTE_EVENT, asQuote, type TextDetail } from "@/lib/chatsdk/chat-events";
import {
  PromptInput,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "./elements/prompt-input";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  StopIcon,
} from "./icons";
import { PreviewAttachment } from "./preview-attachment";
import { Button } from "./ui/button";
import type { VisibilityType } from "./visibility-selector";

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  sendMessage,
  className,
  selectedVisibilityType,
  selectedModelId,
  onModelChange,
  agentIds,
  docked,
  usage,
}: {
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: () => void;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: UIMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  className?: string;
  selectedVisibilityType: VisibilityType;
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
  agentIds?: string[];
  /** In the assistant dock: never rewrite the page URL (it is not the chat page). */
  docked?: boolean;
  usage?: AppUsage;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, [adjustHeight]);

  const resetHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  // "Think": ask the agent for its visible reasoning (Claude extended
  // thinking) on the next messages. Slower, so off by default; remembered.
  const [thinking, setThinking] = useLocalStorage("chat-thinking", false);

  // Long-press menu and swipe gestures hand text to the composer through window events.
  useEffect(() => {
    const onQuote = (e: Event) => {
      const t = (e as CustomEvent<TextDetail>).detail?.text;
      if (!t) return;
      setInput((prev) => asQuote(t) + prev);
      textareaRef.current?.focus();
    };
    const onAsk = (e: Event) => {
      const t = (e as CustomEvent<TextDetail>).detail?.text;
      if (!t) return;
      setInput(t);
      textareaRef.current?.focus();
    };
    window.addEventListener(QUOTE_EVENT, onQuote);
    window.addEventListener(ASK_EVENT, onAsk);
    return () => {
      window.removeEventListener(QUOTE_EVENT, onQuote);
      window.removeEventListener(ASK_EVENT, onAsk);
    };
  }, [setInput]);
  // "Memory": let the agent search past chats and the memory store. Off by
  // default so a chat only sees itself unless asked; remembered.
  const [memory, setMemory] = useLocalStorage("chat-memory", false);

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "input",
    ""
  );

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      // Prefer DOM value over localStorage to handle hydration
      const finalValue = domValue || localStorageInput || "";
      setInput(finalValue);
      adjustHeight();
    }
    // Only run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustHeight, localStorageInput, setInput]);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);

  const submitForm = useCallback(() => {
    if (!docked) window.history.replaceState({}, "", `/chat/${chatId}`);

    sendMessage({
      role: "user",
      parts: [
        ...attachments.map((attachment) => ({
          type: "file" as const,
          url: attachment.url,
          name: attachment.name,
          mediaType: attachment.contentType,
        })),
        {
          type: "text",
          text: input,
        },
      ],
    }, { body: { thinking, memory } });

    setAttachments([]);
    setLocalStorageInput("");
    resetHeight();
    setInput("");

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    docked,
    input,
    thinking,
    memory,
    setInput,
    attachments,
    sendMessage,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
    resetHeight,
  ]);

  const uploadFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const { url, pathname, contentType } = data;

        return {
          url,
          name: pathname,
          contentType,
        };
      }
      const { error } = await response.json();
      toast.error(error);
    } catch (_error) {
      toast.error("Failed to upload file, please try again!");
    }
  }, []);

  const contextProps = useMemo(
    () => ({
      usage,
    }),
    [usage]
  );

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);

      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined
        );

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ]);
      } catch (error) {
        console.error("Error uploading files!", error);
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  return (
    <div className={cn("relative flex w-full flex-col gap-4", className)}>
      <input
        className="-top-4 -left-4 pointer-events-none fixed size-0.5 opacity-0"
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />

      <PromptInput
        data-ui="chat.composer"
        className="rounded-[20px] border border-transparent bg-[var(--opx-soft,#e9edf2)] p-2.5 shadow-none transition-colors duration-200 focus-within:border-[var(--opx-accent,#527bb0)]"
        onSubmit={(event) => {
          event.preventDefault();
          if (status !== "ready") {
            toast.error("Please wait for the model to finish its response!");
          } else {
            submitForm();
          }
        }}
      >
        {(attachments.length > 0 || uploadQueue.length > 0) && (
          <div
            className="flex flex-row items-end gap-2 overflow-x-scroll"
            data-testid="attachments-preview"
          >
            {attachments.map((attachment) => (
              <PreviewAttachment
                attachment={attachment}
                key={attachment.url}
                onRemove={() => {
                  setAttachments((currentAttachments) =>
                    currentAttachments.filter((a) => a.url !== attachment.url)
                  );
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              />
            ))}

            {uploadQueue.map((filename) => (
              <PreviewAttachment
                attachment={{
                  url: "",
                  name: filename,
                  contentType: "",
                }}
                isUploading={true}
                key={filename}
              />
            ))}
          </div>
        )}
        <div className="flex flex-row items-start gap-1 sm:gap-2">
          <PromptInputTextarea
            autoFocus={typeof window !== "undefined" && !window.matchMedia("(pointer: coarse)").matches}
            className="grow resize-none border-0! border-none! bg-transparent p-2 text-sm outline-none ring-0 [-ms-overflow-style:none] [scrollbar-width:none] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-scrollbar]:hidden"
            data-testid="multimodal-input"
            disableAutoResize={true}
            maxHeight={200}
            minHeight={44}
            onChange={handleInput}
            placeholder="Ask about your projects, or plan something…"
            ref={textareaRef}
            rows={1}
            value={input}
          />{" "}
          {usage ? <Context {...contextProps} /> : null}
        </div>
        <PromptInputToolbar className="!border-top-0 border-t-0! p-0 shadow-none dark:border-0 dark:border-transparent!">
          <PromptInputTools className="min-w-0 gap-0 sm:gap-0.5">
            <AttachmentsButton
              fileInputRef={fileInputRef}
              selectedModelId={selectedModelId}
              status={status}
            />
            <ModelSelectorCompact
              agentIds={agentIds}
              onModelChange={onModelChange}
              selectedModelId={selectedModelId}
            />
            <button
              type="button"
              data-ui="chat.think"
              onClick={() => setThinking((v) => !v)}
              aria-pressed={thinking}
              title={thinking ? "Thinking on: the agent shows its reasoning (slower)" : "Show the agent's reasoning on the next message"}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium transition-colors",
                thinking ? "bg-[var(--opx-ink,#20355b)] text-[var(--opx-card,#fff)]" : "text-[var(--opx-muted,#5a687c)] hover:bg-[var(--opx-card,#fff)] hover:text-[var(--opx-ink,#20355b)]"
              )}
            >
              <Brain aria-hidden size={15} strokeWidth={1.9} />
              <span className={docked ? "sr-only" : undefined}>Think</span>
            </button>
            <button
              type="button"
              data-ui="chat.memory"
              onClick={() => setMemory((v) => !v)}
              aria-pressed={memory}
              title={memory ? "Memory on: the agent can search your past chats and memory" : "Let the agent search your past chats and memory"}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium transition-colors",
                memory ? "bg-[var(--opx-ink,#20355b)] text-[var(--opx-card,#fff)]" : "text-[var(--opx-muted,#5a687c)] hover:bg-[var(--opx-card,#fff)] hover:text-[var(--opx-ink,#20355b)]"
              )}
            >
              <BookOpenText aria-hidden size={15} strokeWidth={1.9} />
              <span className={docked ? "sr-only" : undefined}>Memory</span>
            </button>
          </PromptInputTools>

          <span className="ml-auto flex shrink-0 items-center gap-1">
          <HoldToTalk
            disabled={status !== "ready"}
            onText={(t) => setInput((prev) => (prev ? `${prev} ${t}` : t))}
          />
          {status === "submitted" ? (
            <StopButton setMessages={setMessages} stop={stop} />
          ) : (
            <PromptInputSubmit
              data-ui="chat.send"
              className="size-9 shrink-0 rounded-full bg-[var(--opx-ink,#20355b)] text-[var(--opx-card,#fff)] transition-opacity duration-200 hover:opacity-90 disabled:opacity-35"
              disabled={!(input && input.length > 0) || uploadQueue.length > 0}
              status={status}
            >
              <ArrowUpIcon size={14} />
            </PromptInputSubmit>
          )}
          </span>
        </PromptInputToolbar>
      </PromptInput>
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) {
      return false;
    }
    if (prevProps.status !== nextProps.status) {
      return false;
    }
    if (!equal(prevProps.attachments, nextProps.attachments)) {
      return false;
    }
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }
    if (prevProps.selectedModelId !== nextProps.selectedModelId) {
      return false;
    }

    return true;
  }
);

function PureAttachmentsButton({
  fileInputRef,
  status,
  selectedModelId,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers<ChatMessage>["status"];
  selectedModelId: string;
}) {
  const isReasoningModel = selectedModelId === "chat-model-reasoning";

  return (
    <Button
      className="aspect-square h-8 rounded-full p-1 text-[var(--opx-muted,#5a687c)] transition-colors hover:bg-[var(--opx-card,#fff)] hover:text-[var(--opx-ink,#20355b)]"
      data-testid="attachments-button"
      aria-label="Attach a file"
      title="Attach a file"
      disabled={status !== "ready" || isReasoningModel}
      onClick={(event) => {
        event.preventDefault();
        fileInputRef.current?.click();
      }}
      variant="ghost"
    >
      <Paperclip size={16} strokeWidth={1.9} />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

function PureModelSelectorCompact({
  selectedModelId,
  onModelChange,
  agentIds,
}: {
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
  agentIds?: string[];
}) {
  const agents = agentIds ? chatModels.filter((m) => agentIds.includes(m.id)) : chatModels;
  const [optimisticModelId, setOptimisticModelId] = useState(selectedModelId);

  useEffect(() => {
    setOptimisticModelId(selectedModelId);
  }, [selectedModelId]);

  const selectedModel = chatModels.find(
    (model) => model.id === optimisticModelId
  );

  // One agent only (siblings get JARVIS): a plain label, no dropdown.
  if (agents.length <= 1) {
    return (
      <span data-ui="chat.agent" className="flex h-8 items-center rounded-full px-2.5 font-medium text-[12.5px] text-[var(--opx-muted,#5a687c)]">
        {(agents[0] ?? selectedModel)?.name}
      </span>
    );
  }

  return (
    <PromptInputModelSelect
      onValueChange={(modelName) => {
        const model = chatModels.find((m) => m.name === modelName);
        if (model) {
          setOptimisticModelId(model.id);
          onModelChange?.(model.id);
          startTransition(() => {
            saveChatModelAsCookie(model.id);
          });
        }
      }}
      value={selectedModel?.name}
    >
      <Trigger
        data-ui="chat.agent"
        className="flex h-8 min-w-0 items-center gap-1.5 rounded-full border-0 bg-transparent px-2.5 text-[var(--opx-muted,#5a687c)] shadow-none transition-colors hover:bg-[var(--opx-card,#fff)] hover:text-[var(--opx-ink,#20355b)] focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        type="button"
      >
        <span className="font-medium text-xs">
          {selectedModel?.name}
        </span>
        <ChevronDownIcon size={14} />
      </Trigger>
      <PromptInputModelSelectContent className="min-w-[260px] p-0">
        <div className="flex flex-col gap-px">
          {agents.map((model) => (
            <SelectItem key={model.id} value={model.name}>
              <div className="truncate font-medium text-xs">{model.name}</div>
              <div className="mt-px truncate text-[10px] text-muted-foreground leading-tight">
                {model.description}
              </div>
            </SelectItem>
          ))}
        </div>
      </PromptInputModelSelectContent>
    </PromptInputModelSelect>
  );
}

const ModelSelectorCompact = memo(PureModelSelectorCompact);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}) {
  return (
    <Button
      className="size-9 shrink-0 rounded-full bg-[var(--opx-ink,#20355b)] p-1 text-[var(--opx-card,#fff)] transition-opacity duration-200 hover:opacity-90"
      data-testid="stop-button"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);
