" Basic Vim Configuration

" Display
set number                  " Show line numbers
set ruler                   " Show cursor position
set showcmd                 " Show command in bottom bar
set showmode                " Show current mode
set cursorline              " Highlight current line
set laststatus=2            " Always show status line

" Syntax and Colors
syntax on                   " Enable syntax highlighting
set background=dark         " Dark background

" Indentation
set tabstop=4               " Tab = 4 spaces
set shiftwidth=4            " Indent = 4 spaces
set expandtab               " Use spaces instead of tabs
set autoindent              " Auto indent
set smartindent             " Smart indent

" Search
set hlsearch                " Highlight search results
set incsearch               " Incremental search
set ignorecase              " Ignore case when searching
set smartcase               " Unless uppercase is used

" Editing
set backspace=indent,eol,start  " Backspace works as expected
set showmatch               " Highlight matching brackets
set matchtime=2             " Bracket highlight duration (0.2s)

" Encoding
set encoding=utf-8          " UTF-8 encoding
set fileencoding=utf-8      " File encoding

" Clipboard
set clipboard=unnamed       " Use system clipboard

" Performance
set lazyredraw              " Don't redraw during macros
set ttyfast                 " Fast terminal connection

" Misc
set wildmenu                " Command line completion
set scrolloff=5             " Keep 5 lines above/below cursor
set mouse=a                 " Enable mouse support
