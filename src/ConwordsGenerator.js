const seed = require("math-random-seed");
const clone = require("rfdc/default");

/**
 * Crossword Generator Class using Genetic Algorithms
 */
class ConwordsGenerator {
  /**
   * Default options (modifiable) <br> Example: ConwordsGenerator.options.width = 50;
   * @type {Object}
   */

  static options = {
    compilation: null,
    width: 24,
    height: 22,
    emptySpace: "·",
    wordsPerIteration: 2,
    solutionsPerIteration: 33,
    selectedSolutions: 22,
    wordsOnBorder: 0.9,
    minimumLengthFactor: 1,
    finishAt: 600,
    scoreFunction: (filled, crosses, singles) => {
      return (filled * 4 + 2 * crosses) / (1 + singles * 4);
    },
  };

  /**
   * This procedure groups words by length and indexes all words that have the same letter at a certain position. This is done to speed up crossword generation.
   * @param {Array} dictionaries - Array of dictionaries to compile, where each dictionary is an array with the following structure:
   * [
   *   ['word', 'description', 'description', ...],
   *   ['word', 'description', 'description', ...],
   *   ...
   * ]
   * Some examples of dictionaries can be found in the 'dictionaries' folder.
   * @param {Function} fnProgress - Function called each time a percentage of words is processed, receiving the processed percentage as a parameter (0-100).
   * @returns {Promise} - Returns a promise that resolves with the compilation.
   */
  static async compile(dictionaries, fnProgress) {
    /** Function used to wait (Used on the web to avoid blocking the thread)
     * @param {Number} delay - Time in milliseconds to wait
     */
    const delay = async (delay) => {
      return new Promise((resolve) => {
        setTimeout(resolve, delay);
      });
    };

    // Groups all words and descriptions into a single array
    const data = dictionaries.flatMap((d) => d);

    let words = [];
    let phrases = [];
    let groupMap = new Map();
    let p0 = 0;

    // Iterates through all words and groups them by length
    for (let line of data) {
      let percent = Math.round((data.indexOf(line) / data.length) * 100);
      if (p0 !== percent) {
        p0 = percent;
        if (fnProgress) {
          fnProgress(percent);
          await delay(100);
        }
      }

      let set1 = [];
      let set2 = [];

      let idxMap = new Map();

      line.forEach((item) => {
        // Discards words with only 1 letter
        if (item.length > 1) {
          if (item.match(/\s+/) === null) {
            // Texts without spaces go to set1
            set1.push(item);
            let idx = words.indexOf(item);
            if (idx === -1) {
              words.push(item);
              idx = words.length - 1;
            }
            idxMap.set(item, idx);
          } else {
            // Texts with spaces go to set2
            set2.push(item);
            let idx = phrases.indexOf(item);
            if (idx === -1) {
              phrases.push(item);
              idx = phrases.length - 1;
            }
            idxMap.set(item, idx);
          }
        }
      });

      if (set1.length > 0 && set1.length + set2.length > 1) {
        set1.forEach((item) => {
          let itemIdx = idxMap.get(item);
          let groupItem = groupMap.get(itemIdx);
          groupItem = groupItem ? groupItem : [[], []];
          set1.forEach((item2) => {
            if (item !== item2) {
              groupItem[0].push(idxMap.get(item2));
            }
          });
          set2.forEach((item2) => {
            groupItem[1].push(idxMap.get(item2));
          });
          groupMap.set(itemIdx, groupItem);
        });
      }
    }

    const letters = {};
    const lengths = [];
    const questions = [];
    questions.length = words.length;

    for (let idx = 0; idx < questions.length; idx++) {
      questions[idx] = groupMap.get(idx);
    }

    let maxLenght = 0;

    words.forEach((word, idx) => {
      let match = word.match(/[A-Z0-9ÁÉÍÓÚÜÑ]+/);
      if (match !== null && match[0] === word && word.length > 1) {
        if (word.length > maxLenght) {
          maxLenght = word.length;
        }
        let length = word.length;
        if (lengths[length] === undefined) {
          for (let i = 0; i <= length; i++) {
            if (lengths[i] === undefined) {
              lengths[i] = [];
            }
          }
        }
        lengths[length].push(idx);

        for (let i = 0; i < word.length; i++) {
          let letter = "" + i + word[i];
          if (letters[letter] === undefined) {
            letters[letter] = [];
          }
          letters[letter].push(idx);
        }
      }
    });

    return { words, letters, lengths, phrases, questions };
  }

  /**
   * Instantiate a new crossword generator specifying the configuration options.
   * Example options: { width: 50, height: 50, compilation: myCompilation }
   *
   * @param {Object} options - Configuration options
   * @param {Object} options.compilation - Compilation of dictionaries (null by default, must be provided)
   * @param {Number} options.width - Width of the crossword (24 by default)
   * @param {Number} options.height - Height of the crossword (22 by default)
   * @param {String} options.emptySpace - Character for unused space ('·' by default)
   * @param {Number} options.wordsPerIteration - Number of words added in each new iteration (2 by default)
   * @param {Number} options.selectedSolutions - Number of solutions selected from the previous generation to be used in the next iteration (22 by default)
   * @param {Number} options.solutionsPerIteration - Number of solutions generated in each iteration, based on the selected solutions from the previous generation (33 by default)
   * @param {Number} options.wordsOnBorder - Number of words on the borders [0, 1] (0.9 by default)
   * @param {Number} options.minimumLengthFactor - Factor for decreasing the minimum length in iterations: the higher it is, the more quickly the minimum length of words will decrease between each iteration (1 by default)
   * @param {Number} options.finishAt - Maximum number of attempts to find a solution, after reaching these attempts, the solution is marked as finished and no more solutions will be attempted (600 by default)
   * @param {Function} options.scoreFunction - A function that assigns a score to the crossword and depends on the percentage of filling, the number of word crosses, and the number of isolated words (not crossing with others) ((filled * 4 + 2 * crosses) / (1 + singles * 4) by default)
   */
  constructor(options) {
    if (!options.compilation) {
      throw new Error(
        "You must pass the compilation of dictionaries as a parameter"
      );
    }
    this.#configure(ConwordsGenerator.options);
    this.#configure(options);
  }

  /**
   * Generates the initial crossword matrix.
   * @param {Number} seed - Seed to generate the crossword matrix (random by default).
   * @returns {Array} - Crossword matrix (If no seed is provided, a random one is generated).
   */
  generate(seedData = this.#generateSerial()) {
    let matrix = Array.from({ length: this.options.height }).map(() =>
      new Array(this.options.width).fill([
        this.options.emptySpace,
        false,
        false,
      ])
    );
    matrix.questions = new Set();
    matrix.questionsData = [];
    matrix.width = this.options.width;
    matrix.height = this.options.height;
    this.seed = "" + seedData;
    this.random = seed(seedData);
    return matrix;
  }

  /**
   * Performs an iteration of crossword generation.
   * @param {*} matrices
   * @returns The resulting matrix of the iteration.
   */
  iterate(matrices) {
    if (matrices.questions !== undefined) {
      matrices = [matrices];
    }
    let solutions = [];
    for (let i = 0; i < this.options.solutionsPerIteration; i++) {
      let idx = Math.floor(
        (matrices.length * i) / this.options.solutionsPerIteration
      );
      let matrix = matrices[idx];
      let clonedMatrix = clone(matrix);

      for (let word = 0; word < this.options.wordsPerIteration; word++) {
        clonedMatrix = this.#generateQuestion(clonedMatrix);
      }
      solutions.push(clonedMatrix);
    }
    return this.#selectSolutions(solutions);
  }

  /**
   * Fills unused spaces with short words.
   * @param {*} matrices
   * @returns The matrix with filled empty spaces.
   */
  fillEmptySpaces(matrices) {
    // Most of this method will be commented
    // Iterate through matrices
    matrices.forEach((matrix) => {
      let continueIteration = true;

      while (continueIteration) {
        let points = [];

        // Iterate through rows
        for (let x = 0; x < this.options.width; x++) {
          // Iterate through columns
          for (let y = 0; y < this.options.height; y++) {
            // If there is an empty space at x, y
            if (matrix[y][x][0] === this.options.emptySpace) {
              // Find the largest horizontal word space passing through x, y
              // Also, check that there is no horizontal word above or below the word we are looking for
              let x1 = x,
                x2 = x,
                x1Collision = false,
                x2Collision = false,
                continueX1 = true;

              while (continueX1) {
                // Reached the left edge
                if (x1 < 0) {
                  x1 = 0;
                  continueX1 = false;
                  x1Collision = false;
                }
                // Collides with a horizontal word
                else if (matrix[y][x1][2]) {
                  continueX1 = false;
                  x1++;
                  x1++;
                  x1Collision = false;
                }
                // Collides with a vertical word
                else if (matrix[y][x1][1]) {
                  continueX1 = false;
                  x1Collision = true;
                }
                // Is below a horizontal word
                else if (
                  y > 0 &&
                  matrix[y - 1][x1][0] !== this.options.emptySpace
                ) {
                  continueX1 = false;
                  x1++;
                  x1Collision = false;
                }
                // Is above a horizontal word
                else if (
                  y < this.options.height - 1 &&
                  matrix[y + 1][x1][0] !== this.options.emptySpace
                ) {
                  continueX1 = false;
                  x1++;
                  x1Collision = false;
                }

                if (continueX1) {
                  x1--;
                }
              }

              continueX1 = true;
              while (continueX1) {
                // Reached the right edge
                if (x2 >= this.options.width) {
                  x2 = this.options.width - 1;
                  continueX1 = false;
                  x2Collision = false;
                }
                // Collides with a horizontal word
                else if (matrix[y][x2][2]) {
                  continueX1 = false;
                  x2--;
                  x2--;
                  x2Collision = false;
                }
                // Collides with a vertical word
                else if (matrix[y][x2][1]) {
                  continueX1 = false;
                  x2Collision = true;
                }
                // Is below a horizontal word
                else if (
                  y > 0 &&
                  matrix[y - 1][x2][0] !== this.options.emptySpace
                ) {
                  continueX1 = false;
                  x2--;
                  x2Collision = false;
                }
                // Is above a horizontal word
                else if (
                  y < this.options.height - 1 &&
                  matrix[y + 1][x2][0] !== this.options.emptySpace
                ) {
                  continueX1 = false;
                  x2--;
                  x2Collision = false;
                }

                if (continueX1) {
                  x2++;
                }
              }

              if ((x1Collision || x2Collision) && x1 < x2) {
                points.push({
                  x: x1,
                  y: y,
                  size: x2 + 1 - x1,
                  horizontal: true,
                });

                if (x1Collision) {
                  for (let size = 2; size <= x2 + 1 - x1; size++) {
                    points.push({
                      x: x1,
                      y: y,
                      size: x2 + 1 - x1,
                      horizontal: true,
                    });
                  }
                }
              }

              // Find the largest vertical word space passing through x, y
              // Also, check that there is no vertical word next to the word we are looking for

              let y1 = y,
                y2 = y,
                y1Collision = false,
                y2Collision = false;
              continueX1 = true;

              while (continueX1) {
                // Reached the top edge
                if (y1 < 0) {
                  y1 = 0;
                  continueX1 = false;
                  y1Collision = false;
                }
                // Collides with a vertical word
                else if (matrix[y1][x][1]) {
                  continueX1 = false;
                  y1++;
                  y1++;
                  y1Collision = false;
                }
                // Collides with a horizontal word
                else if (matrix[y1][x][2]) {
                  continueX1 = false;
                  y1Collision = true;
                }
                // Is to the left of a vertical word
                else if (
                  x > 0 &&
                  matrix[y1][x - 1][0] !== this.options.emptySpace
                ) {
                  continueX1 = false;
                  y1++;
                  y1Collision = false;
                }
                // Is to the right of a vertical word
                else if (
                  x < this.options.width - 1 &&
                  matrix[y1][x + 1][0] !== this.options.emptySpace
                ) {
                  continueX1 = false;
                  y1++;
                  y1Collision = false;
                }

                if (continueX1) {
                  y1--;
                }
              }

              continueX1 = true;
              while (continueX1) {
                // Reached the bottom edge
                if (y2 >= this.options.height) {
                  y2 = this.options.height - 1;
                  continueX1 = false;
                  y2Collision = false;
                }
                // Collides with a vertical word
                else if (matrix[y2][x][1]) {
                  continueX1 = false;
                  y2--;
                  y2--;
                  y2Collision = false;
                }
                // Collides with a horizontal word
                else if (matrix[y2][x][2]) {
                  continueX1 = false;
                  y2Collision = true;
                }
                // Is to the left of a vertical word
                else if (
                  x > 0 &&
                  matrix[y2][x - 1][0] !== this.options.emptySpace
                ) {
                  continueX1 = false;
                  y2--;
                  y2Collision = false;
                }
                // Is to the right of a vertical word
                else if (
                  x < this.options.width - 1 &&
                  matrix[y2][x + 1][0] !== this.options.emptySpace
                ) {
                  continueX1 = false;
                  y2--;
                  y2Collision = false;
                }

                if (continueX1) {
                  y2++;
                }
              }

              if ((y1Collision || y2Collision) && y1 < y2) {
                points.push({
                  x: x,
                  y: y1,
                  size: y2 + 1 - y1,
                  horizontal: false,
                });
              }
            }
          }
        }

        points.sort((a, b) => {
          return b.size - a.size;
        });

        continueIteration = false;

        for (let point of points) {
          let matches = new Set();

          if (point.horizontal) {
            if (matrix[point.y][point.x][0] !== this.options.emptySpace) {
              matches.add("" + 0 + matrix[point.y][point.x][0]);
            }
            if (
              matrix[point.y][point.x + point.size - 1][0] !==
              this.options.emptySpace
            ) {
              matches.add(
                "" +
                  (point.size - 1) +
                  matrix[point.y][point.x + point.size - 1][0]
              );
            }
          } else {
            if (matrix[point.y][point.x][0] !== this.options.emptySpace) {
              matches.add("" + 0 + matrix[point.y][point.x][0]);
            }
            if (
              matrix[point.y + point.size - 1][point.x][0] !==
              this.options.emptySpace
            ) {
              matches.add(
                "" +
                  (point.size - 1) +
                  matrix[point.y + point.size - 1][point.x][0]
              );
            }
          }

          let words = this.options.compilation.lengths[point.size];

          if (words !== undefined) {
            words = words.filter((word) => this.ignored.has(word) === false);
            words = words ? words : [];

            for (let match of matches) {
              let wordsMatch = this.options.compilation.letters[match];

              if (wordsMatch !== undefined) {
                words = words.filter((w) => wordsMatch.includes(w));
              } else {
                words = [];
              }
            }

            words = words.filter((w) => !matrix.questions.has(w));

            if (words.length > 0) {
              let pos = Math.floor(Math.random() * words.length);
              let idx = words[pos];
              let word = this.options.compilation.words[idx];
              let x = point.x,
                y = point.y;

              for (let i = 0; i < word.length; i++) {
                matrix[y][x][0] = word[i];

                if (point.horizontal) {
                  matrix[y][x][2] = true;
                  x++;
                } else {
                  matrix[y][x][1] = true;
                  y++;
                }
              }

              continueIteration = true;

              matrix.questions.add(idx);

              matrix.questionsData.push({
                idx,
                word,
                horizontal: point.horizontal ? 1 : 0,
                x: point.x,
                y: point.y,
              });

              break;
            }
          }
        }
      }
    });

    return this.#selectSolutions(matrices);
  }

  /**
   * Formats the crossword for console display.
   * @param {Array} matrices - Crossword matrix
   * @param {Boolean} questions - Indicates if questions are displayed (false by default)
   * @param {Number} layer - 0 by default
   * @param {Number} visibleSolutions - Indicates the number of visible solutions (1 by default)
   * @returns {String} - Formatted crossword matrix
   */
  toString(matrices, questions = false, layer = 0, visibleSolutions = 1) {
    if (matrices.questions !== undefined) {
      matrices = [matrices];
    }
    let texts = [];
    let height = 0;
    let mt = [...matrices];
    mt.length = visibleSolutions;
    mt.forEach((matrix) => {
      if (matrix) {
        let s = "    ";
        for (let x = 0; x < this.options.width; x++) {
          s = s + Math.trunc(x / 10) + " ";
        }
        s = s + "\n    ";
        for (let x = 0; x < this.options.width; x++) {
          s = s + (x % 10) + " ";
        }
        s = s + "\n\n";
        for (let y = 0; y < this.options.height; y++) {
          s = s + (y < 10 ? "0" : "") + y + "  ";
          for (let x = 0; x < this.options.width; x++) {
            s =
              s +
              (layer > 0
                ? matrix[y][x][layer].toUpperCase()
                  ? "#"
                  : "·"
                : matrix[y][x][0].toUpperCase()) +
              " ";
          }
          s = s + "\n";
        }

        let lines = s.split("\n");
        if (lines.length > height) {
          height = lines.length;
        }

        texts.push(lines);
      }
    });

    function pad(s, n) {
      try {
        let x = s.length < n ? pad(s + " ", n) : s.substring(0, n);
        return x;
      } catch (error) {
        return ".";
      }
    }
    let ss = "";
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < texts.length; j++) {
        ss += pad(
          texts[j][i] ? texts[j][i] : "",
          Math.max(26, this.options.width * 2 + 5)
        );
      }
      ss = ss + "\n";
    }

    if (questions) {
      mt.forEach((matrix) => {
        for (let orientation of [1, 0]) {
          let s = "\n" + (orientation ? "HORIZONTAL:" : "VERTICAL:") + "\n";
          for (let y = 0; y < this.options.height; y++) {
            for (let x = 0; x < this.options.width; x++) {
              let question = matrix.questionsData.find(
                (q) => q.x === x && q.y === y && q.horizontal === orientation
              );
              if (question) {
                let q = clone(this.options.compilation.questions[question.idx]);
                q[0] = q[0].filter((idx) => idx !== question.idx);
                q[0] = q[0].map((idx) => this.options.compilation.words[idx]);
                q[1] = q[1].map((idx) => this.options.compilation.phrases[idx]);
                let options = [...q[0], ...q[1]];
                q = options[Math.floor(this.random() * options.length)];
                question.question = q;
                question.horizontal = question.horizontal === 1;
                delete question.idx;
                s =
                  s +
                  `${(x < 10 ? "0" : "") + x}${(y < 10 ? "0" : "") + y}:${
                    question.word
                  }: ${q}\n`;
              }
            }
          }
          ss = ss + s;
        }
      });
    }

    const matrix = matrices[0];

    ss = `${ss}\nSUMMARY (${this.seed})\n-------------------\nSIZE: ${
      this.options.width
    }x${this.options.height}\nHASH: ${matrix.hash}\nCROSSES: ${
      matrix.intersections
    }\nISOLATED WORDS: ${matrix.isolatedWords}\nFILL: ${
      matrix.fillingPercentage
    } ${
      matrix.fillingPercentage
        ? Math.round(
            (100 * matrix.fillingPercentage) /
              this.options.width /
              this.options.height
          )
        : ""
    }%\nSCORE: ${matrix.score}`;

    return ss;
  }

  /**
   * Returns the crossword matrix in JSON format.
   * @param {*} matrix
   * @returns Matrix in JSON format
   */
  getJSON(matrix) {
    if (matrix.questions === undefined) {
      matrix = matrix[0];
    }
    const questions = clone(matrix.questionsData);
    for (let orientation of [1, 0]) {
      for (let y = 0; y < this.options.height; y++) {
        for (let x = 0; x < this.options.width; x++) {
          let question = questions.find(
            (q) => q.x === x && q.y === y && q.horizontal === orientation
          );
          if (question) {
            let q = clone(this.options.compilation.questions[question.idx]);
            q[0] = q[0].filter((idx) => idx !== question.idx);
            q[0] = q[0].map((idx) => this.options.compilation.words[idx]);
            q[1] = q[1].map((idx) => this.options.compilation.phrases[idx]);
            let options = [...q[0], ...q[1]];
            q = options[Math.floor(this.random() * options.length)];
            question.question = q;
            question.horizontal = question.horizontal === 1;
            delete question.idx;
          }
        }
      }
    }
    return questions;
  }
  /** Indices of ignored words that will not be used in the next generation. <br>
   * To clean, execute: generator.ignored.clear() */
  ignored = new Set();

  ///////////////////////////////////////////////////////////////////////////////

  /** Ignores a set of words */
  #ignoreWords(words) {
    words.forEach((w) => this.ignored.add(w));
  }

  /** Overrides the options */
  #configure(options) {
    options = options || {};
    this.options = {
      ...this.options,
      ...options,
    };
  }

  #sortQuestions(matrices) {
    const clonedMatrices = clone(matrices);
    for (let matrix of clonedMatrices) {
      for (let i = 1; i < matrix.questionsData.length; i++) {
        for (let j = 0; j < i; j++) {
          if (
            matrix.questionsData[i].y * this.options.width +
              matrix.questionsData[i].x -
              matrix.questionsData[i].horizontal * 0.5 <
            matrix.questionsData[j].y * this.options.width +
              matrix.questionsData[j].x -
              matrix.questionsData[j].horizontal * 0.5
          ) {
            let aux = matrix.questionsData[i];
            matrix.questionsData[i] = matrix.questionsData[j];
            matrix.questionsData[j] = aux;
            aux = matrix.questions[i];
            matrix.questions[i] = matrix.questions[j];
            matrix.questions[j] = aux;
          }
        }
      }
    }
    return clonedMatrices;
  }

  /**
   * Removes words that do not intersect with any other word
   * @param {*} matrices
   * @returns {Array}
   */
  #isolatedWords(matrices) {
    return matrices.map((matrix) => {
      let isolatedIndices = new Set();
      matrix.questionsData.forEach((question1) => {
        let subIntersections = 0;
        matrix.questionsData.forEach((question2) => {
          if (
            question1.word !== question2.word &&
            question1.horizontal !== question2.horizontal
          ) {
            if (question1.horizontal) {
              if (
                question1.x <= question2.x &&
                question1.x + question1.word.length > question2.x
              ) {
                if (
                  question1.y >= question2.y &&
                  question1.y < question2.y + question2.word.length
                ) {
                  subIntersections++;
                }
              }
            } else {
              if (
                question1.y <= question2.y &&
                question1.y + question1.word.length > question2.y
              ) {
                if (
                  question1.x >= question2.x &&
                  question1.x < question2.x + question2.word.length
                ) {
                  subIntersections++;
                }
              }
            }
          }
        });
        if (subIntersections === 0) {
          isolatedIndices.add(question1);
        }
      });
      return isolatedIndices;
    });
  }

  /**
   * Evaluates an array of solutions and returns the best solutions (specified by cantidadRetornada)
   */
  #selectSolutions(
    solutions,
    cantidadRetornada = this.options.selectedSolutions
  ) {
    solutions.forEach((matrix) => {
      matrix.hash = this.#hashCode(
        matrix.questionsData.reduce((prev, current) => {
          return (
            prev +
            current.word +
            "_" +
            current.horizontal +
            "_" +
            current.x +
            "_" +
            current.y
          );
        }, "")
      );
      let intersections = this.#getIntersections(matrix);
      matrix.intersections = intersections[0];
      matrix.isolatedWords = intersections[1];
      matrix.fillingPercentage = this.#getFillingPercentage(matrix);
      matrix.score = this.options.scoreFunction(
        matrix.fillingPercentage,
        matrix.intersections,
        matrix.isolatedWords
      );
    });

    let uniqueSolutionsIndices = [];
    let uniqueSolutions = [];
    solutions.forEach((matrix) => {
      if (!uniqueSolutionsIndices.includes(matrix.hash)) {
        uniqueSolutionsIndices.push(matrix.hash);
        uniqueSolutions.push(matrix);
      }
    });

    uniqueSolutions.sort((a, b) => b.score - a.score);
    uniqueSolutions.length = Math.min(
      uniqueSolutions.length,
      cantidadRetornada
    );

    return uniqueSolutions;
  }

  /** Removes accents from a letter */
  #normalizeLetter(letter) {
    return letter
      .replace("á", "a")
      .replace("é", "e")
      .replace("í", "i")
      .replace("ó", "o")
      .replace("ú", "u")
      .replace("ü", "u");
  }

  /**
   * Private method that generates a random seed, given another seed and the length of the seed
   */
  #generateSerial(random = seed(), serialLength) {
    const DEFAULT_SERIAL_SIZE = 8;
    const SERIAL_CHARACTERS = "1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    serialLength = serialLength || DEFAULT_SERIAL_SIZE;
    let randomSerial = "";
    for (let i = 0; i < serialLength; i = i + 1) {
      let randomNumber = Math.floor(random() * SERIAL_CHARACTERS.length);
      randomSerial += SERIAL_CHARACTERS.substring(
        randomNumber,
        randomNumber + 1
      );
    }
    return randomSerial;
  }

  /**
   * Generates a question based on a cloned matrix
   * @param {Array} matrixClone - Cloned matrix
   * @returns {Array} - Matrix with generated question
   */
  #generateQuestion(matrixClone) {
    let intento = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (matrixClone.finish) {
        return matrixClone;
      } else {
        intento++;
        if (intento === this.options.finishAt) {
          if (this.options.wordsOnBorder && !matrixClone.borde) {
            matrixClone.borde = true;
            intento = 0;
          } else {
            matrixClone.finish = true;
            return matrixClone;
          }
        }
        // 0: vertical, 1: horizontal
        let horizontal = Math.floor(this.random() * 2);
        let length = Math.max(
          Math.max(
            //
            2,
            Math.min(
              this.options.width,
              this.options.height,
              Math.trunc(this.options.compilation.lengths.length / 3) - 1
            ) -
              Math.floor(
                matrixClone.questionsData.length *
                  this.options.minimumLengthFactor
              )
          ),
          Math.floor(
            this.random() *
              Math.min(
                horizontal === 1 ? this.options.width : this.options.height,
                this.options.compilation.lengths.length
              )
          )
        );

        let palabras = this.options.compilation.lengths[length];

        palabras = palabras.filter(
          (palabra) => this.ignored.has(palabra) === false
        );

        let x,
          y,
          matches = [];
        if (this.options.wordsOnBorder && !matrixClone.borde) {
          x = horizontal //
            ? Math.floor(this.random() * (this.options.width - length)) //
            : Math.floor(this.random() * 2) * (this.options.width - 1);
          y = horizontal //
            ? Math.floor(this.random() * 2) * (this.options.height - 1)
            : Math.floor(this.random() * (this.options.height - length));
        } else {
          x = horizontal //
            ? Math.floor(this.random() * (this.options.width - length)) //
            : Math.floor(this.random() * this.options.width);
          y = horizontal //
            ? Math.floor(this.random() * this.options.height)
            : Math.floor(this.random() * (this.options.height - length));
        }

        let ok = true;

        if (
          // Fails if at the beginning or end of the word it is occupied
          (horizontal &&
            x > 0 &&
            matrixClone[y][x - 1][0] !== this.options.emptySpace) ||
          (horizontal &&
            x < this.options.width - length &&
            matrixClone[y][x + length][0] !== this.options.emptySpace) ||
          (!horizontal &&
            y > 0 &&
            matrixClone[y - 1][x][0] !== this.options.emptySpace) ||
          (!horizontal &&
            y < this.options.height - length &&
            matrixClone[y + length][x][0] !== this.options.emptySpace)
        ) {
          ok = false;
        }
        let vecinoAdjacente = new Set();
        let vecinoCruce = new Set();
        if (ok) {
          // Traverse the rows
          for (let i = 0; i < length; i++) {
            // Fails: if the word is horizontal and intersects with another horizontal word
            if (horizontal && matrixClone[y][x + i][1 + horizontal]) {
              ok = false;
              break;
            }
            // Fails: if the word is vertical and intersects with another vertical word
            if (!horizontal && matrixClone[y + i][x][1 + horizontal]) {
              ok = false;
              break;
            }
            if (ok) {
              let match;
              if (horizontal) {
                if (y > 0) {
                  match = this.#getPreguntasPorPosicion(
                    matrixClone,
                    x + i,
                    y - 1
                  );
                  match.forEach((p) => {
                    vecinoAdjacente.add(p.idx);
                  });
                }
                if (y < this.options.height - 1) {
                  match = this.#getPreguntasPorPosicion(
                    matrixClone,
                    x + i,
                    y + 1
                  );
                  match.forEach((p) => {
                    vecinoAdjacente.add(p.idx);
                  });
                }
                match = this.#getPreguntasPorPosicion(matrixClone, x + i, y);
                match.forEach((p) => vecinoCruce.add(p.idx));
              } else {
                if (x > 0) {
                  match = this.#getPreguntasPorPosicion(
                    matrixClone,
                    x - 1,
                    y + i
                  );
                  match.forEach((p) => {
                    vecinoAdjacente.add(p.idx);
                  });
                }
                if (x < this.options.width - 1) {
                  match = this.#getPreguntasPorPosicion(
                    matrixClone,
                    x + 1,
                    y + i
                  );
                  match.forEach((p) => {
                    vecinoAdjacente.add(p.idx);
                  });
                }
                match = this.#getPreguntasPorPosicion(matrixClone, x, y + i);
                match.forEach((p) => vecinoCruce.add(p.idx));
              }
              if (
                horizontal &&
                matrixClone[y][x + i][0] !== this.options.emptySpace
              ) {
                matches.push("" + i + matrixClone[y][x + i][0]);
              }
              if (
                !horizontal &&
                matrixClone[y + i][x][0] !== this.options.emptySpace
              ) {
                matches.push("" + i + matrixClone[y + i][x][0]);
              }
            }
          }
        }
        if (
          [...vecinoAdjacente].filter((m) => !vecinoCruce.has(m)).length > 0
        ) {
          ok = false;
        }

        if (ok) {
          if (matches.length > 0) {
            let _palabras = [];
            palabras.forEach((palabra) => {
              let ok = true;
              for (let match of matches) {
                let palabrasMatch = this.options.compilation.letters[match];
                if (
                  palabrasMatch === undefined ||
                  (palabrasMatch !== undefined &&
                    !palabrasMatch.includes(palabra))
                ) {
                  ok = false;
                  break;
                }
              }
              if (ok) {
                _palabras.push(palabra);
              }
            });
            palabras = _palabras;
          } else if (this.options.wordsOnBorder && matrixClone.borde) {
            ok = false;
          }
          if (ok && palabras.length > 0) {
            let idx = undefined;
            let count = 0;
            while (idx === undefined || matrixClone.questions.has(idx)) {
              idx = palabras[Math.floor(this.random() * palabras.length)];
              count++;
              if (count === 100) {
                ok = false;
                break;
              }
            }
            if (ok) {
              let word = this.options.compilation.words[idx];

              for (let i = 0; i < length; i++) {
                let letra = this.#normalizeLetter(word.charAt(i));
                if (horizontal) {
                  matrixClone[y][x + i][0] = letra;
                  matrixClone[y][x + i][1 + horizontal] = true;
                }
                if (!horizontal) {
                  matrixClone[y + i][x][0] = letra;
                  matrixClone[y + i][x][1 + horizontal] = true;
                }
              }

              matrixClone.questions.add(idx);
              matrixClone.questionsData.push({
                idx,
                word,
                horizontal,
                x,
                y,
              });
              if (this.options.wordsOnBorder && !matrixClone.borde) {
                let total = (this.options.width + this.options.height) * 2;
                let llevo = matrixClone.questionsData
                  .map((p) => p.word)
                  .join("").length;
                //console.log(total, llevo, total - llevo);
                matrixClone.borde = llevo / total > this.options.wordsOnBorder;
              }
              return matrixClone;
            }
          }
        }
      }
    }
  }

  /**
   * Generates a hash code for a given string
   * @param {string} str - The input string
   * @returns {number} - The hash code
   */
  #hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * Returns the filled spaces of the crossword puzzle
   * @param {Array} matrix - The crossword puzzle matrix
   * @returns {number} - The number of filled spaces
   */
  #getFillingPercentage(matrix) {
    return Math.trunc(
      Math.trunc(
        matrix.reduce((acc, fila) => {
          let length = fila.filter((x) => {
            return x[0] !== this.options.emptySpace;
          }).length;
          return acc + length;
        }, 0)
      )
    );
  }

  /**
   * Returns the number of intersections and the number of isolated questions in the crossword puzzle
   * @param {Array} matrix - The crossword puzzle matrix
   * @returns {Array} - An array containing the number of intersections and isolated questions
   */
  #getIntersections(matrix) {
    let crosses = 0;
    let singles = 0;
    matrix.singlesIdx = new Set();
    matrix.questionsData.forEach((question1) => {
      let subCruces = 0;
      matrix.questionsData.forEach((question2) => {
        if (
          question1.word !== question2.word &&
          question1.horizontal !== question2.horizontal
        ) {
          if (question1.horizontal) {
            if (
              question1.x <= question2.x &&
              question1.x + question1.word.length > question2.x
            ) {
              if (
                question1.y >= question2.y &&
                question1.y < question2.y + question2.word.length
              ) {
                subCruces++;
              }
            }
          } else {
            if (
              question1.y <= question2.y &&
              question1.y + question1.word.length > question2.y
            ) {
              if (
                question1.x >= question2.x &&
                question1.x < question2.x + question2.word.length
              ) {
                subCruces++;
              }
            }
          }
        }
      });
      if (subCruces === 0) {
        singles++;
        matrix.singlesIdx.add(question1);
      }
      crosses += subCruces;
    });
    return [crosses, singles];
  }

  /**
   * Returns the questions at a specific coordinate in the crossword puzzle
   * @param {Array} matrix - The crossword puzzle matrix
   * @param {number} x - The x-coordinate
   * @param {number} y - The y-coordinate
   * @returns {Array} - An array containing the questions at the specified coordinate
   */
  #getPreguntasPorPosicion(matrix, x, y) {
    let found = [];
    matrix.questionsData.forEach((question) => {
      if (
        (question.horizontal &&
          question.x <= x &&
          question.x + question.word.length > x &&
          question.y === y) ||
        (!question.horizontal &&
          question.y <= y &&
          question.y + question.word.length > y &&
          question.x === x)
      ) {
        found.push(question);
      }
    });
    return found;
  }
}

module.exports = ConwordsGenerator;
