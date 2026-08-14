import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ProjectState, ChatMessage } from '../types/video';
import { processChatCommand } from '../services/groq';
import { Send, Sparkles, MessageSquare, Plus, Zap } from 'lucide-react';
import { SkillsMenu } from './SkillsMenu';
import { Skill, SkillPreset, parseSlashCommand } from '../data/skills';

interface AiCopilotProps {
  state: ProjectState;
  onAddChatMessage: (msg: ChatMessage) => void;
  onApplyAiCommands: (commands: any[], explanation: string) => void;
  onSetIsProcessing: (processing: boolean) => void;
}

const now = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const AiCopilot: React.FC<AiCopilotProps> = ({
  state,
  onAddChatMessage,
  onApplyAiCommands,
  onSetIsProcessing
}) => {
  const { chatHistory, isProcessingAi, apiKey, media } = state;
  const [inputValue, setInputValue] = useState('');
  const [skillsOpen, setSkillsOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);

  // SkillsMenu installs its key handler here so the input keeps focus while
  // the palette is driven by the arrow keys.
  const menuKeyHandler = useRef<((e: React.KeyboardEvent) => boolean) | null>(null);
  const registerKeyHandler = useCallback(
    (handler: (e: React.KeyboardEvent) => boolean) => {
      menuKeyHandler.current = handler;
    },
    []
  );

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  /** A bare `/token` with no trailing space is a live palette query. Matching
   *  the raw value matters: once a preset is inserted the composer holds
   *  `/slug ` and must *not* re-trigger the menu. */
  const readQuery = (value: string) => /^\/([a-z0-9-]*)$/i.exec(value)?.[1] ?? null;
  const slashQuery = readQuery(inputValue);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    setSkillsOpen(readQuery(value) !== null);
  };

  // Close on outside click.
  useEffect(() => {
    if (!skillsOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // The menu is portalled outside the composer, so check it separately.
      if (composerRef.current?.contains(target) || target.closest?.('.skills-menu')) return;
      setSkillsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [skillsOpen]);

  const closeMenu = useCallback(() => {
    setSkillsOpen(false);
    menuKeyHandler.current = null;
  }, []);

  /** Drop the chosen slash command into the composer, ready to send. */
  const handlePickPreset = (_skill: Skill, preset: SkillPreset) => {
    setInputValue(`/${preset.id} `);
    closeMenu();
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (skillsOpen && menuKeyHandler.current?.(e)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') closeMenu();
  };

  const toggleSkills = () => {
    if (skillsOpen) {
      closeMenu();
      return;
    }
    setSkillsOpen(true);
    if (!inputValue.trim()) setInputValue('/');
    inputRef.current?.focus();
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isProcessingAi) return;

    const text = inputValue.trim();
    const slash = parseSlashCommand(text);

    // Presets that carry commands run locally — no API key, no round trip.
    if (slash?.preset.commands && !slash.rest) {
      setInputValue('');
      closeMenu();

      onAddChatMessage({
        id: `msg-${Date.now()}`,
        sender: 'user',
        text,
        timestamp: now()
      });

      onApplyAiCommands(slash.preset.commands, slash.preset.description);

      onAddChatMessage({
        id: `msg-${Date.now() + 1}`,
        sender: 'ai',
        text: `Applied ${slash.skill.name} · ${slash.preset.name} — ${slash.preset.description}`,
        timestamp: now(),
        status: 'success'
      });
      return;
    }

    // Capabilities the editor doesn't ship yet answer directly, no API round trip.
    if (slash?.preset.soon && !slash.rest) {
      setInputValue('');
      closeMenu();

      onAddChatMessage({
        id: `msg-${Date.now()}`,
        sender: 'user',
        text,
        timestamp: now()
      });
      onAddChatMessage({
        id: `msg-${Date.now() + 1}`,
        sender: 'ai',
        text: `${slash.preset.name} isn't available yet — the editor doesn't ship ${slash.skill.name.toLowerCase()} yet. Pick one of the ready skills instead.`,
        timestamp: now()
      });
      return;
    }

    if (!apiKey) {
      alert('Please enter a Groq API Key first at the top of the page.');
      return;
    }

    setInputValue('');
    closeMenu();

    onAddChatMessage({
      id: `msg-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: now()
    });
    onSetIsProcessing(true);

    // A slash preset without local commands becomes a natural-language prompt.
    const outbound = slash
      ? [slash.preset.prompt ?? slash.preset.description, slash.rest].filter(Boolean).join(' ')
      : text;

    try {
      const response = await processChatCommand(outbound, state);

      onAddChatMessage({
        id: `msg-${Date.now() + 1}`,
        sender: 'ai',
        text: response.explanation,
        timestamp: now(),
        status: 'success'
      });
      onApplyAiCommands(response.commands, response.explanation);
    } catch (err: any) {
      console.error(err);
      onAddChatMessage({
        id: `msg-${Date.now() + 1}`,
        sender: 'ai',
        text: `Error executing command: ${err.message || 'Groq API request failed.'}`,
        timestamp: now(),
        status: 'error'
      });
    } finally {
      onSetIsProcessing(false);
    }
  };

  const handleSuggestionClick = (prompt: string) => {
    setInputValue(prompt);
    inputRef.current?.focus();
  };

  return (
    <div className="copilot-panel">
      <div className="panel-header">
        <MessageSquare size={16} className="accent-glow-cyan" />
        <h2>AI Copilot Chat</h2>
      </div>

      <div className="chat-messages-container">
        {chatHistory.length === 0 ? (
          <div className="chat-empty">
            <Sparkles size={24} className="accent-glow-purple" />
            <p>Welcome to Edith Copilot</p>
            <span>
              Ask the AI to adjust captions, crop focus, or trim the timeline — or press
              <kbd className="inline-kbd">/</kbd> to browse skills.
            </span>

            {media && (
              <div className="chat-suggestions">
                <button onClick={() => handleSuggestionClick('/caption-hormozi-punch ')}>
                  🔠 Caption · Hormozi Punch
                </button>
                <button onClick={() => handleSuggestionClick('/camera-punch-right ')}>
                  ➡️ Camera · Punch Right
                </button>
                <button onClick={() => handleSuggestionClick('Make the subtitles smaller')}>
                  🔎 Smaller Captions
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="chat-flow">
            {chatHistory.map((msg) => (
              <div key={msg.id} className={`chat-message ${msg.sender} ${msg.status === 'error' ? 'error' : ''}`}>
                <div className="message-bubble">
                  <div className="message-sender-title">
                    {msg.sender === 'user' ? 'You' : 'Edith AI'}
                  </div>
                  <p>{msg.text}</p>
                  <span className="message-time">{msg.timestamp}</span>
                </div>
              </div>
            ))}
            {isProcessingAi && (
              <div className="chat-message ai pending">
                <div className="message-bubble">
                  <div className="spinner-dots">
                    <span>.</span><span>.</span><span>.</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      <form className="chat-input-form" onSubmit={handleSend}>
        <div className="composer-anchor" ref={composerRef}>
          {skillsOpen && (
            <SkillsMenu
              query={slashQuery ?? ''}
              anchorRef={composerRef}
              onPick={handlePickPreset}
              onClose={closeMenu}
              registerKeyHandler={registerKeyHandler}
            />
          )}

          <div className={`input-row-container ${skillsOpen ? 'menu-open' : ''}`}>
            <button type="button" className="input-icon-btn" title="Add source asset">
              <Plus size={18} />
            </button>

            <button
              type="button"
              className={`input-badge-btn active-skills ${skillsOpen ? 'is-open' : ''}`}
              onClick={toggleSkills}
              title="Browse skills (/)"
            >
              <span>⚡ Skills</span>
            </button>

            <input
              ref={inputRef}
              type="text"
              placeholder={media ? "Describe a change, or type / to add skills…" : 'Upload video to use copilot…'}
              value={inputValue}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              disabled={isProcessingAi || !media}
              className="copilot-input-box"
            />

            <button type="button" className="input-icon-btn text-yellow" title="API usage details">
              <Zap size={15} />
            </button>

            <button
              type="submit"
              className="input-send-btn"
              disabled={!inputValue.trim() || isProcessingAi || !media}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
