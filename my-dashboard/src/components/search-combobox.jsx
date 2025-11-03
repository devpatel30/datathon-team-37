import { useState, useEffect } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

export function SearchCombobox({ value, onChange, className, apiBase }) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  // Keep local input in sync when parent value changes (e.g., selection applied externally)
  useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  // Fetch suggestions when input changes
  useEffect(() => {
    const getSuggestions = async () => {
      const q = (inputValue || '').trim();
      if (!q) {
        setSuggestions([]);
        return;
      }

      try {
        const base = apiBase || (window.__API_BASE__ || 'http://localhost:3001');
        const res = await fetch(`${base}/api/suggestions?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSuggestions(data);
      } catch (error) {
        console.error('Error fetching suggestions:', error);
        setSuggestions([]);
      }
    };

    const timer = setTimeout(getSuggestions, 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setIsOpen(true);
  };

  const handleSubmit = () => {
    const raw = (inputValue || '').trim();
    const upper = raw.toUpperCase();
    // Prefer exact symbol match; else use best suggestion (by name or first)
    const exact = suggestions.find(s => (s.symbol || '').toUpperCase() === upper);
    let finalSymbol = upper;
    if (!exact) {
      const byName = suggestions.find(s => (s.name || '').toLowerCase().startsWith(raw.toLowerCase()));
      const first = byName || suggestions[0];
      if (first && first.symbol) finalSymbol = first.symbol.toUpperCase();
    }
    setInputValue(finalSymbol);
    onChange(finalSymbol);
    setIsOpen(false);
  };

  const handleSuggestionSelect = (suggestion) => {
    const symbol = (suggestion?.symbol || '').trim();
    setInputValue(symbol);
    onChange(symbol);
    setIsOpen(false);
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-2 w-full">
  <Popover.Root open={isOpen && suggestions.length > 0}>
          <Popover.Trigger asChild>
            <div className="flex-1">
              <Input
                value={inputValue}
                onChange={handleInputChange}
                onFocus={() => setIsOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSubmit();
                  }
                }}
                placeholder="Enter company name or symbol..."
                className="flex-1 min-w-0 text-white bg-slate-900 border-gray-700 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </Popover.Trigger>

          <Popover.Portal>
            <Popover.Content
              className="bg-slate-900 border border-gray-700 rounded-md shadow-lg mt-1 p-1 w-[var(--radix-popover-trigger-width)] max-h-[300px] overflow-auto z-50"
              onOpenAutoFocus={(e) => e.preventDefault()}
              onInteractOutside={() => setIsOpen(false)}
            >
              <div className="py-1">
                {suggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.symbol}-${suggestion.name}`}
                    className="w-full text-left px-4 py-2 text-sm text-white hover:bg-slate-800 rounded"
                    // Use onMouseDown to ensure selection happens before focus/blur closes the popover
                    onMouseDown={(e) => { e.preventDefault(); handleSuggestionSelect(suggestion); }}
                  >
                    <div className="font-medium">{suggestion.symbol}</div>
                    <div className="text-gray-400 text-xs truncate">{suggestion.name}</div>
                  </button>
                ))}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <Button 
          onClick={handleSubmit}
          className="bg-slate-900 text-white border-gray-700 hover:bg-gray-700"
        >
          Search
        </Button>
      </div>
    </div>
  );
}