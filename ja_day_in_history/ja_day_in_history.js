/* jslint node: true */
'use strict';

const MenuModule = require('../../core/menu_module.js').MenuModule;
const { displayThemedPause } = require('../../core/theme.js');
const https = require('https');

exports.moduleInfo = {
    name: 'Day in History',
    desc: 'Displays historical events that occurred on the current day with configurable variety strategies',
    author: 'j0hnny A1pha',
    packageName: 'com.brokenbitsyndicate.dayinhistory',
};

exports.getModule = class DayInHistoryModule extends MenuModule {
    constructor(options) {
        super(options);
        this.events = [];
        
        // Map commands to strategies since ENiGMA isn't passing our custom extraArgs
        let detectedStrategy = 'era-based'; // default
        
        if (options.extraArgs && options.extraArgs.command) {
            const command = options.extraArgs.command;
            
            switch (command) {
                case 'D':
                    detectedStrategy = 'era-based';
                    break;
                case 'D1':
                    detectedStrategy = 'oldest-first';
                    break;
                case 'D2':
                    detectedStrategy = 'source-balanced';
                    break;
                case 'D3':
                    detectedStrategy = 'random';
                    break;
                default:
                    detectedStrategy = 'era-based';
                    break;
            }
        }
        
        // Configuration options for variety strategies
        const defaultConfig = {
            varietyStrategy: detectedStrategy,
            minYear: 1,
            maxYear: 2030,
            excludeBirthsDeaths: true,
            eras: [
                { name: 'Ancient', min: 1, max: 500, quota: 1 },
                { name: 'Medieval', min: 501, max: 1500, quota: 1 },
                { name: 'Early Modern', min: 1501, max: 1800, quota: 1 },
                { name: 'Modern', min: 1801, max: 1950, quota: 1 },
                { name: 'Contemporary', min: 1951, max: 2030, quota: 1 }
            ]
        };
        
        // Merge configuration (but command-based detection takes precedence)
        this.config = Object.assign({}, defaultConfig);
        
        // Use info level for important strategy information
        this.client.log.info({
            module: 'DayInHistory',
            strategy: this.config.varietyStrategy
        }, `Day in History initialized with ${this.config.varietyStrategy} strategy`);
    }

    initSequence() {
        const self = this;
        
        const async = require('async');
        
        async.series([
            callback => {
                return self.beforeArt(callback);
            },
            callback => {
                return self.displayHeader(callback);
            },
            callback => {
                return self.displayLoadingMessage(callback);
            },
            callback => {
                return self.fetchHistoricalEventsFromAPI(callback);
            },
            callback => {
                return self.displayEvents(callback);
            },
            callback => {
                return self.displayPause(callback);
            }
        ], () => {
            self.finishedLoading();
        });
    }

    displayHeader(cb) {
        const now = new Date();
        const day = now.getDate();
        const month = now.toLocaleString('default', { month: 'long' });
        
        // Get ordinal ending (st, nd, rd, th) - matching Go version logic
        const getNumEnding = (day) => {
            if (day === 1 || (day % 10 === 1 && day !== 11)) return "st";
            if (day === 2 || (day % 10 === 2 && day !== 12)) return "nd";
            if (day === 3 || (day % 10 === 3 && day !== 13)) return "rd";
            return "th";
        };
        
        // Clear screen and move cursor to home - exact Go version
        this.client.term.write('\x1B[2J\x1B[H');
        
        // Header with EXACT Go formatting
        this.client.term.write('\r\n \x1B[30;1m\x1B[0m-\x1B[36m---\x1B[32;1m-\x1B[0m\x1B[36m--\x1B[32;1m-\x1B[0m\x1B[36m-\x1B[32;1m--------- ------------------------------------ ------ -- -  \x1B[0m\r\n');
        
        this.client.term.write(' \x1B[42m\x1B[37;1m>> \x1B[32;1mGlimpse In Time v1  \x1B[0m\x1B[42m\x1B[30m>>\x1B[40m\x1B[32m>>  \x1B[0m\x1B[37;1m\x1B[36;1mENiGMA mod inspired by Smooth \x1B[0m\x1B[36m<\x1B[37;1mPHEN0M\x1B[0m\x1B[36m>\x1B[0m\r\n');
        
        this.client.term.write(' \x1B[30;1m-\x1B[0m\x1B[36m--\x1B[32;1m--\x1B[0m\x1B[36m---\x1B[32;1m-\x1B[0m\x1B[36m-\x1B[32;1m----- --- -------------------------------- ------ -- -  \x1B[0m\r\n');
        
        this.client.term.write(` \x1B[41m\x1B[30m>>\x1B[40m \x1B[35;1mOn \x1B[0m\x1B[33;1mTHIS DAY\x1B[35;1m, These \x1B[33;1mEVENTS \x1B[35;1mHappened... \x1B[0m\x1B[31m:: \x1B[33m${month} ${day}${getNumEnding(day)} \x1B[31m::\x1B[0m\r\n`);
        
        this.client.term.write(' \x1B[30;1m-\x1B[0m\x1B[36m--\x1B[32;1m--\x1B[0m\x1B[36m---\x1B[32;1m-\x1B[0m\x1B[36m-\x1B[32;1m--\x1B[0m\x1B[36m--\x1B[32;1m-\x1B[0m\x1B[36m---\x1B[32;1m--- ---------------------------- ------ -- -  \x1B[0m\r\n');
        
        return cb(null);
    }

    displayLoadingMessage(cb) {
        const self = this;
        
        // Show initial loading message
        this.client.term.write('\x1B[10;1H');
        this.client.term.write(' \x1B[33;1mFetching historical data from Wikimedia...\x1B[0m\r\n\r\n');
        
        // Define loading steps with proper Unicode block characters - single line updates
        const loadingSteps = [
            {
                bar: ' \x1B[36m\u2588\x1B[37m\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591 \x1B[32mConnecting to Wikipedia API\x1B[0m',
                delay: 300
            },
            {
                bar: this.config.varietyStrategy !== 'era-based' 
                    ? ` \x1B[36m\u2588\u2588\x1B[37m\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591 \x1B[32mUsing ${this.config.varietyStrategy} variety strategy\x1B[0m`
                    : ` \x1B[36m\u2588\u2588\x1B[37m\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591 \x1B[32mProcessing historical timeline\x1B[0m`,
                delay: 400
            },
            {
                bar: ' \x1B[36m\u2588\u2588\u2588\x1B[37m\u2591\u2591\u2591\u2591\u2591\u2591\u2591 \x1B[32mRetrieving today\'s events\x1B[0m',
                delay: 350
            },
            {
                bar: ' \x1B[36m\u2588\u2588\u2588\u2588\x1B[37m\u2591\u2591\u2591\u2591\u2591\u2591 \x1B[32mApplying filters and sorting\x1B[0m',
                delay: 250
            }
        ];
        
        // Set fixed position for the loading bar (row 12)
        const loadingBarRow = 12;
        
        // Animate each loading bar step on the same line
        let stepIndex = 0;
        
        const showNextStep = () => {
            if (stepIndex < loadingSteps.length) {
                const step = loadingSteps[stepIndex];
                
                // Position cursor at fixed row and clear the line, then display the loading bar
                this.client.term.write(`\x1B[${loadingBarRow};1H\x1B[K`); // Move to row and clear line
                this.client.term.write(step.bar);
                
                stepIndex++;
                
                // Schedule next step
                setTimeout(showNextStep, step.delay);
            } else {
                // All steps complete, wait a moment then continue
                setTimeout(() => {
                    return cb(null);
                }, 200);
            }
        };
        
        // Start the animation
        setTimeout(showNextStep, 200);
    }

    displayPause(cb) {
        const self = this;
        // Display the exact Go version pause message on row 24
        this.client.term.write('\x1B[24;1H');
        this.client.term.write('                   \x1B[46m\x1B[37;1m<\x1B[0m\x1B[36m<  \x1B[30;1m... \x1B[0m\x1B[37mpress \x1B[37;1mANY KEY \x1B[0m\x1B[37mto \x1B[37;1mCONTINUE \x1B[0m\x1B[30;1m... \x1B[0m\x1B[36m>\x1B[44m\x1B[37;1m>\x1B[0m');
        
        // Wait for any key press and then go to previous menu (no double pause)
        this.client.once('key press', (ch, key) => {
            self.prevMenu();
        });
        
        return cb(null);
    }

    fetchHistoricalEventsFromAPI(cb) {
        const self = this;
        
        // Use Wikimedia's "On This Day" API
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        
        const options = {
            hostname: 'api.wikimedia.org',
            path: `/feed/v1/wikipedia/en/onthisday/all/${month}/${day}`,
            headers: {
                'User-Agent': 'Enigma BBS Day-in-History Module/1.1 (enigma-bbs.org)',
                'Accept': 'application/json',
                'Accept-Encoding': 'identity'
            }
        };
        
        // Only debug log if debug is enabled
        if (this.config.debugVariety) {
            this.client.log.debug({
                module: 'DayInHistory',
                url: `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/all/${month}/${day}`
            }, 'Fetching historical events from Wikimedia API');
        }
        
        const req = https.get(options, (res) => {
            // Handle redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
                const redirectUrl = res.headers.location;
                if (self.config.debugVariety) {
                    self.client.log.debug({
                        module: 'DayInHistory',
                        redirectUrl: redirectUrl
                    }, 'Following API redirect');
                }
                // Handle redirect (simplified for this example)
                return cb(new Error('Redirect handling not implemented'));
            }
            
            if (res.statusCode !== 200) {
                self.client.log.warn({
                    module: 'DayInHistory',
                    statusCode: res.statusCode
                }, 'Wikimedia API returned non-200 status');
                return cb(new Error(`API request failed with status ${res.statusCode}`));
            }
            
            let data = '';
            res.on('data', chunk => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    const allEvents = self.parseWikimediaResponse(response);
                    self.events = allEvents;
                    return cb(null);
                } catch (err) {
                    self.client.log.error({
                        module: 'DayInHistory',
                        error: err.message
                    }, 'Failed to parse API response');
                    return cb(err);
                }
            });
        });
        
        req.on('error', (err) => {
            self.client.log.error({
                module: 'DayInHistory',
                error: err.message
            }, 'Failed to fetch data from Wikimedia API');
            return cb(err);
        });
        
        req.setTimeout(10000, () => {
            req.destroy();
            self.client.log.warn({
                module: 'DayInHistory'
            }, 'API request timed out');
            return cb(new Error('Request timeout'));
        });
    }

    parseWikimediaResponse(response) {
        try {
            const allEvents = [];
            
            // Process events section
            if (response.events && Array.isArray(response.events)) {
                for (const event of response.events) {
                    if (event.year && event.text) {
                        const year = parseInt(event.year);
                        if (year >= this.config.minYear && year <= this.config.maxYear) {
                            allEvents.push({
                                year: year,
                                text: event.text,
                                type: 'event'
                            });
                        }
                    }
                }
            }
            
            // Optionally include births and deaths if not excluded
            if (!this.config.excludeBirthsDeaths) {
                ['births', 'deaths'].forEach(category => {
                    if (response[category] && Array.isArray(response[category])) {
                        for (const item of response[category]) {
                            if (item.year && item.text) {
                                const year = parseInt(item.year);
                                if (year >= this.config.minYear && year <= this.config.maxYear) {
                                    allEvents.push({
                                        year: year,
                                        text: item.text,
                                        type: category.slice(0, -1) // 'birth' or 'death'
                                    });
                                }
                            }
                        }
                    }
                });
            }
            
            // Apply the selected variety strategy  
            this.client.log.info({
                module: 'DayInHistory',
                strategy: this.config.varietyStrategy,
                totalEvents: allEvents.length
            }, `Applying ${this.config.varietyStrategy} strategy to ${allEvents.length} events`);
            
            let selectedEvents;
            switch (this.config.varietyStrategy) {
                case 'era-based':
                    selectedEvents = this.selectEventsByEra(allEvents);
                    break;
                case 'source-balanced':
                    selectedEvents = this.selectEventsBySource(allEvents);
                    break;
                case 'oldest-first':
                    selectedEvents = this.selectOldestEvents(allEvents);
                    break;
                case 'random':
                    selectedEvents = this.selectRandomEvents(allEvents);
                    break;
                default:
                    selectedEvents = this.selectRandomEvents(allEvents);
                    break;
            }
            
            return selectedEvents;
            
        } catch (err) {
            this.client.log.error({
                module: 'DayInHistory',
                error: err.message
            }, 'Error parsing Wikimedia response structure');
            return [];
        }
    }

    selectEventsByEra(allEvents) {
        if (allEvents.length === 0) return [];
        
        const selectedEvents = [];
        
        // First pass: Try to get quota events from each defined era
        for (const era of this.config.eras) {
            const eraEvents = allEvents.filter(event => 
                event.year >= era.min && event.year <= era.max
            );
            
            // Randomly select events from this era up to the quota
            const shuffled = eraEvents.sort(() => 0.5 - Math.random());
            const selected = shuffled.slice(0, era.quota);
            selectedEvents.push(...selected);
        }
        
        // Sort selected events by year
        selectedEvents.sort((a, b) => a.year - b.year);
        
        return selectedEvents;
    }

    selectEventsBySource(allEvents) {
        // Implement source-balanced strategy
        // For now, just return a random selection
        return this.selectRandomEvents(allEvents, 5);
    }

    selectOldestEvents(allEvents) {
        // Sort by year and take the oldest ones
        const sorted = allEvents.sort((a, b) => a.year - b.year);
        return sorted.slice(0, 5);
    }

    selectRandomEvents(allEvents, count = 5) {
        const shuffled = allEvents.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    }

    displayEvents(cb) {
        if (this.events.length === 0) {
            this.client.term.write('\x1B[2J\x1B[H');
            this.client.term.write('\r\n \x1B[31;1mNo historical events found for today.\x1B[0m\r\n');
            return cb(null);
        }
        
        // Clear screen completely and redraw header before displaying events
        this.client.term.write('\x1B[2J\x1B[H');
        
        const now = new Date();
        const day = now.getDate();
        const month = now.toLocaleString('default', { month: 'long' });
        const year = now.getFullYear();
        
        // Get ordinal ending (st, nd, rd, th) - matching Go version logic
        const getNumEnding = (day) => {
            if (day === 1 || (day % 10 === 1 && day !== 11)) return "st";
            if (day === 2 || (day % 10 === 2 && day !== 12)) return "nd";
            if (day === 3 || (day % 10 === 3 && day !== 13)) return "rd";
            return "th";
        };
        
        // Redraw header completely
        this.client.term.write('\r\n \x1B[30;1m\x1B[0m-\x1B[36m---\x1B[32;1m-\x1B[0m\x1B[36m--\x1B[32;1m-\x1B[0m\x1B[36m-\x1B[32;1m--------- ------------------------------------ ------ -- -  \x1B[0m\r\n');
        
        this.client.term.write(' \x1B[42m\x1B[37;1m>> \x1B[32;1mGlimpse In Time v1  \x1B[0m\x1B[42m\x1B[30m>>\x1B[40m\x1B[32m>>  \x1B[0m\x1B[37;1m\x1B[36;1mENiGMA mod inspired by Smooth \x1B[0m\x1B[36m<\x1B[37;1mPHEN0M\x1B[0m\x1B[36m>\x1B[0m\r\n');
        
        this.client.term.write(' \x1B[30;1m-\x1B[0m\x1B[36m--\x1B[32;1m--\x1B[0m\x1B[36m---\x1B[32;1m-\x1B[0m\x1B[36m-\x1B[32;1m----- --- -------------------------------- ------ -- -  \x1B[0m\r\n');
        
        this.client.term.write(` \x1B[41m\x1B[30m>>\x1B[40m \x1B[35;1mOn \x1B[0m\x1B[33;1mTHIS DAY\x1B[35;1m, These \x1B[33;1mEVENTS \x1B[35;1mHappened... \x1B[0m\x1B[31m:: \x1B[33m${month} ${day}${getNumEnding(day)} \x1B[31m::\x1B[0m\r\n`);
        
        this.client.term.write(' \x1B[30;1m-\x1B[0m\x1B[36m--\x1B[32;1m--\x1B[0m\x1B[36m---\x1B[32;1m-\x1B[0m\x1B[36m-\x1B[32;1m--\x1B[0m\x1B[36m--\x1B[32;1m-\x1B[0m\x1B[36m---\x1B[32;1m--- ---------------------------- ------ -- -  \x1B[0m\r\n');
        
        // Position cursor at row 8, column 1 for events display (matching Go version)
        this.client.term.write('\x1B[8;1H');
        
        // Calculate dynamic display limits - pause is on row 24, footer ends on row 23
        const maxContentRows = 15; // Rows 8-22 (footer starts on row 20, pause on row 24)
        let yPos = 8;
        let eventsDisplayed = 0;
        
        // Get current time for footer - matching Go version
        const currentTime = now.toLocaleTimeString([], { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        }).replace(/^(\d+):/, '$1:');
        
        for (let index = 0; index < this.events.length; index++) {
            const event = this.events[index];
            
            // Create prefix with proper 4-digit year padding and calculate text wrapping
            const paddedYear = event.year.toString().padStart(4, ' '); // Always 4 characters
            const prefix = ` \x1B[36;1m${paddedYear}\x1B[0m\x1B[36m <\x1B[30;1m:\x1B[0m\x1B[36m> `;
            const prefixDisplayLength = 10; // " YYYY <:> " = always 10 characters now
            const maxLineLength = 75 - prefixDisplayLength; // Leave room for prefix
            
            // Word wrap the event text
            const wrappedLines = this.wrapText(event.text.trim(), maxLineLength);
            const eventRows = wrappedLines.length + 1; // +1 for blank line after event
            
            // Check if this event will fit in remaining space
            const rowsFromStart = yPos - 8; // Current position relative to start (row 8)
            const rowsNeeded = rowsFromStart + eventRows;
            
            if (rowsNeeded > maxContentRows || eventsDisplayed >= 5) {
                // This event won't fit or we've hit the 5 event limit, stop here
                if (this.config.debugVariety) {
                    this.client.log.debug({
                        module: 'DayInHistory',
                        eventIndex: index + 1,
                        eventRows: eventRows,
                        rowsFromStart: rowsFromStart,
                        maxContentRows: maxContentRows,
                        eventsDisplayed: eventsDisplayed
                    }, `Event ${index + 1} won't fit or limit reached, stopping display`);
                }
                break;
            }
            
            // Display first line with prefix (year is now always 4 digits padded)
            this.client.term.write(`\x1B[${yPos};1H`);
            this.client.term.write(`${prefix}\x1B[37;1m${wrappedLines[0]}\x1B[0m\r\n`);
            yPos++;
            
            // Display continuation lines with proper indentation (10 spaces to align with text)
            for (let i = 1; i < wrappedLines.length; i++) {
                this.client.term.write(`\x1B[${yPos};1H`);
                this.client.term.write(`          \x1B[37;1m${wrappedLines[i]}\x1B[0m\r\n`);
                yPos++;
            }
            
            // Add blank line between events
            yPos++;
            eventsDisplayed++;
        }
        
        // Position footer at row 20-22 (3 rows before pause on row 24)
        this.client.term.write('\x1B[20;1H');
        this.client.term.write(' \x1B[30;1m-\x1B[0m\x1B[36m---\x1B[32;1m-\x1B[0m\x1B[36m--\x1B[32;1m-\x1B[0m\x1B[36m-\x1B[32;1m-----\x1B[0m\x1B[36m-\x1B[32;1m--------------------------------------- ---  --- -- -  \x1B[0m\r\n');
        
        // Include strategy in footer like previous versions - show ACTUAL strategy used
        const strategyDisplay = ` \x1B[36m(${this.config.varietyStrategy})\x1B[0m`;
        
        this.client.term.write(` \x1B[41m\x1B[30m>>\x1B[40m \x1B[37;1mGenerated on ${month} ${day}, ${year} at ${currentTime}${strategyDisplay}\x1B[0m\r\n`);
        
        this.client.term.write(' \x1B[30;1m-\x1B[0m\x1B[36m---\x1B[32;1m-\x1B[0m\x1B[36m--\x1B[32;1m-\x1B[0m\x1B[36m-\x1B[32;1m-----\x1B[0m\x1B[36m-\x1B[32;1m--------------------------------------- ---  --- -- -  \x1B[0m\r\n');
        
        return cb(null);
    }
    
    // Word wrapping helper function
    wrapText(text, maxLineLength) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        
        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            
            if (testLine.length <= maxLineLength) {
                currentLine = testLine;
            } else {
                if (currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    // Word is too long, break it up
                    if (word.length > maxLineLength) {
                        lines.push(word.substring(0, maxLineLength - 3) + '...');
                        currentLine = '';
                    } else {
                        currentLine = word;
                    }
                }
            }
        }
        
        if (currentLine) {
            lines.push(currentLine);
        }
        
        return lines.length > 0 ? lines : [''];
    }
};