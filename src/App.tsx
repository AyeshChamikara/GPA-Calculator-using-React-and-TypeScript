import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Calculator, PlusCircle, Trash2, ChevronDown, ChevronUp, User, Edit2, Save } from 'lucide-react'
import { openDB } from 'idb'

interface Course {
  id: string;
  name: string;
  grade: string;
  credits: number;
}

interface Semester {
  id: string;
  name: string;
  courses: Course[];
}

interface Year {
  id: string;
  name: string;
  semesters: Semester[];
}

interface UserProfile {
  name: string;
  indexNumber: string;
  university: string;
  photo: string;
}

const gradePoints: { [key: string]: number } = {
  'A': 4.0, 'A-': 3.7,
  'B+': 3.3, 'B': 3.0, 'B-': 2.7,
  'C+': 2.3, 'C': 2.0, 'C-': 1.7,
  'D+': 1.3, 'D': 1.0, 'D-': 0.7,
  'F': 0.0
}

const dbPromise = openDB('gpaCalculator', 3, {
  upgrade(db, oldVersion, newVersion) {
    if (oldVersion < 2) {
      db.createObjectStore('years', { keyPath: 'id' });
    }
    if (oldVersion < 3) {
      db.createObjectStore('userProfile', { keyPath: 'id' });
    }
  },
});

const App: React.FC = () => {
  const [years, setYears] = useState<Year[]>([])
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set())
  const nextId = useRef(1)
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: '',
    indexNumber: '',
    university: '',
    photo: '',
  })
  const [isEditingProfile, setIsEditingProfile] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      const db = await dbPromise;
      const tx = db.transaction(['years', 'userProfile'], 'readonly');
      const yearsStore = tx.objectStore('years');
      const profileStore = tx.objectStore('userProfile');
      
      const loadedYears = await yearsStore.getAll();
      const loadedProfile = await profileStore.get('user');

      if (loadedYears.length > 0) {
        setYears(loadedYears);
        setExpandedYears(new Set(loadedYears.map(year => year.id)));
        nextId.current = Math.max(...loadedYears.flatMap(year => 
          [parseInt(year.id), ...year.semesters.flatMap(semester => 
            [parseInt(semester.id), ...semester.courses.map(course => parseInt(course.id))]
          )]
        )) + 1;
      } else {
        const initialYear: Year = {
          id: '1',
          name: 'Year 1',
          semesters: [
            { id: '1-1', name: 'Semester 1', courses: [] },
            { id: '1-2', name: 'Semester 2', courses: [] }
          ]
        };
        setYears([initialYear]);
        setExpandedYears(new Set(['1']));
        saveData([initialYear]);
      }

      if (loadedProfile) {
        setUserProfile(loadedProfile);
      }
    };
    loadData();
  }, []);

  const saveData = async (data: Year[]) => {
    const db = await dbPromise;
    const tx = db.transaction('years', 'readwrite');
    const store = tx.objectStore('years');
    
    await store.clear();
    await Promise.all(data.map(year => store.add(year)));
    await tx.done;
  };

  const saveUserProfile = async (profile: UserProfile) => {
    const db = await dbPromise;
    const tx = db.transaction('userProfile', 'readwrite');
    const store = tx.objectStore('userProfile');
    await store.put({ ...profile, id: 'user' });
    await tx.done;
  };

  const generateId = useCallback(() => {
    nextId.current += 1
    return nextId.current.toString()
  }, [])

  const addYear = useCallback(() => {
    setYears(prevYears => {
      const newYearId = generateId()
      const newYears = [
        ...prevYears,
        {
          id: newYearId,
          name: `Year ${prevYears.length + 1}`,
          semesters: [
            { id: `${newYearId}-1`, name: 'Semester 1', courses: [] },
            { id: `${newYearId}-2`, name: 'Semester 2', courses: [] }
          ]
        }
      ];
      saveData(newYears);
      setExpandedYears(prev => new Set(prev).add(newYearId));
      return newYears;
    })
  }, [generateId])

  const deleteYear = useCallback((yearId: string) => {
    setYears(prevYears => {
      const newYears = prevYears.filter(year => year.id !== yearId);
      saveData(newYears);
      return newYears;
    });
    setExpandedYears(prev => {
      const newSet = new Set(prev);
      newSet.delete(yearId);
      return newSet;
    });
  }, []);

  const addSemester = useCallback((yearId: string) => {
    setYears(prevYears => {
      const newYears = prevYears.map(year => {
        if (year.id === yearId) {
          const newSemesterId = generateId();
          return {
            ...year,
            semesters: [
              ...year.semesters,
              { id: newSemesterId, name: `Semester ${year.semesters.length + 1}`, courses: [] }
            ]
          };
        }
        return year;
      });
      saveData(newYears);
      return newYears;
    });
  }, [generateId]);

  const deleteSemester = useCallback((yearId: string, semesterId: string) => {
    setYears(prevYears => {
      const newYears = prevYears.map(year => {
        if (year.id === yearId) {
          return {
            ...year,
            semesters: year.semesters.filter(semester => semester.id !== semesterId)
          };
        }
        return year;
      });
      saveData(newYears);
      return newYears;
    });
  }, []);

  const addCourse = useCallback((yearId: string, semesterId: string) => {
    setYears(prevYears => {
      const newYears = prevYears.map(year => {
        if (year.id === yearId) {
          return {
            ...year,
            semesters: year.semesters.map(semester => {
              if (semester.id === semesterId) {
                return {
                  ...semester,
                  courses: [
                    ...semester.courses,
                    {
                      id: generateId(),
                      name: '',
                      grade: 'A',
                      credits: 3
                    }
                  ]
                }
              }
              return semester
            })
          }
        }
        return year
      });
      saveData(newYears);
      return newYears;
    })
  }, [generateId])

  const updateCourse = useCallback((yearId: string, semesterId: string, courseId: string, field: keyof Course, value: string | number) => {
    setYears(prevYears => {
      const newYears = prevYears.map(year => 
        year.id === yearId
          ? {
              ...year,
              semesters: year.semesters.map(semester => 
                semester.id === semesterId
                  ? {
                      ...semester,
                      courses: semester.courses.map(course => 
                        course.id === courseId
                          ? { ...course, [field]: value }
                          : course
                      )
                    }
                  : semester
              )
            }
          : year
      );
      saveData(newYears);
      return newYears;
    })
  }, [])

  const removeCourse = useCallback((yearId: string, semesterId: string, courseId: string) => {
    setYears(prevYears => {
      const newYears = prevYears.map(year => 
        year.id === yearId
          ? {
              ...year,
              semesters: year.semesters.map(semester => 
                semester.id === semesterId
                  ? {
                      ...semester,
                      courses: semester.courses.filter(course => course.id !== courseId)
                    }
                  : semester
              )
            }
          : year
      );
      saveData(newYears);
      return newYears;
    })
  }, [])

  const handleProfileChange = (field: keyof UserProfile, value: string) => {
    setUserProfile(prev => ({ ...prev, [field]: value }));
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        handleProfileChange('photo', reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = () => {
    saveUserProfile(userProfile);
    setIsEditingProfile(false);
  };

  const handleDeleteProfile = () => {
    setUserProfile({
      name: '',
      indexNumber: '',
      university: '',
      photo: '',
    });
    saveUserProfile({
      name: '',
      indexNumber: '',
      university: '',
      photo: '',
    });
    setIsEditingProfile(false);
  };

  const calculateGPA = (courses: Course[]): number => {
    let totalPoints = 0;
    let totalCredits = 0;

    courses.forEach(course => {
      totalPoints += gradePoints[course.grade] * course.credits;
      totalCredits += course.credits;
    })

    return totalCredits > 0 ? parseFloat((totalPoints / totalCredits).toFixed(2)) : 0;
  }

  const calculateSemesterGPA = (semester: Semester): number => {
    return calculateGPA(semester.courses);
  }

  const calculateYearGPA = (year: Year): number => {
    const allCourses = year.semesters.flatMap(semester => semester.courses);
    return calculateGPA(allCourses);
  }

  const calculateCumulativeGPA = (): number => {
    const allCourses = years.flatMap(year => year.semesters.flatMap(semester => semester.courses));
    return calculateGPA(allCourses);
  };

  const toggleYearExpansion = (yearId: string) => {
    setExpandedYears(prev => {
      const newSet = new Set(prev);
      if (newSet.has(yearId)) {
        newSet.delete(yearId);
      } else {
        newSet.add(yearId);
      }
      return newSet;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-100 to-white py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-4xl font-bold mb-8 text-center flex items-center justify-center text-blue-800">
          <Calculator className="mr-3" size={36} /> GPA Calculator
        </h1>

        {/* User Profile Section */}
        <div className="mb-8 bg-white p-6 rounded-lg shadow-lg border border-blue-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-blue-700">User Profile</h2>
            {!isEditingProfile && (
              <button
                onClick={() => setIsEditingProfile(true)}
                className="p-2 text-blue-500 hover:text-blue-700 transition-colors duration-200"
              >
                <Edit2 size={20} />
              </button>
            )}
          </div>
          {isEditingProfile ? (
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Name"
                value={userProfile.name}
                onChange={(e) => handleProfileChange('name', e.target.value)}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
              />
              <input
                type="text"
                placeholder="Index Number"
                value={userProfile.indexNumber}
                onChange={(e) => handleProfileChange('indexNumber', e.target.value)}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
              />
              <input
                type="text"
                placeholder="University"
                value={userProfile.university}
                onChange={(e) => handleProfileChange('university', e.target.value)}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
              />
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
              />
              <div className="flex justify-between">
                <button
                  onClick={handleSaveProfile}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors duration-200"
                >
                  <Save size={20} className="inline mr-2" /> Save
                </button>
                <button
                  onClick={handleDeleteProfile}
                  className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors duration-200"
                >
                  <Trash2 size={20} className="inline mr-2" /> Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {userProfile.photo && (
                <img src={userProfile.photo} alt="User" className="w-32 h-32 rounded-full mx-auto mb-4" />
              )}
              <p><strong>Name:</strong> {userProfile.name || 'Not set'}</p>
              <p><strong>Index Number:</strong> {userProfile.indexNumber || 'Not set'}</p>
              <p><strong>University:</strong> {userProfile.university || 'Not set'}</p>
            </div>
          )}
        </div>

        {/* Existing GPA Calculator Content */}
        {years.map((year) => (
          <div key={year.id} className="mb-8 bg-white p-6 rounded-lg shadow-lg border border-blue-200">
            <div className="flex justify-between items-center mb-4">
              <div 
                className="flex items-center cursor-pointer"
                onClick={() => toggleYearExpansion(year.id)}
              >
                <h2 className="text-2xl font-semibold text-blue-700 mr-2">{year.name}</h2>
                {expandedYears.has(year.id) ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
              </div>
              <button
                onClick={() => deleteYear(year.id)}
                className="p-2 text-red-500 hover:text-red-700 transition-colors duration-200"
              >
                <Trash2 size={20} />
              </button>
            </div>
            {expandedYears.has(year.id) && (
              <>
                {year.semesters.map((semester) => (
                  <div key={semester.id} className="mt-4 p-4 bg-blue-50 rounded-md">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-xl font-medium text-blue-600">{semester.name}</h3>
                      <button
                        onClick={() => deleteSemester(year.id, semester.id)}
                        className="p-1 text-red-500 hover:text-red-700 transition-colors duration-200"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {semester.courses.map((course) => (
                      <div key={course.id} className="mb-2 flex items-center space-x-2">
                        <input
                          type="text"
                          placeholder="Course name"
                          value={course.name}
                          onChange={(e) => updateCourse(year.id, semester.id, course.id, 'name', e.target.value)}
                          className="flex-grow p-2 border rounded focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
                        />
                        <select
                          value={course.grade}
                          onChange={(e) => updateCourse(year.id, semester.id, course.id, 'grade', e.target.value)}
                          className="p-2 border rounded focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
                        >
                          {Object.keys(gradePoints).map(grade => (
                            <option key={grade} value={grade}>{grade}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={course.credits}
                          onChange={(e) => updateCourse(year.id, semester.id, course.id, 'credits', parseInt(e.target.value) || 0)}
                          className="w-20 p-2 border rounded focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
                          min="0"
                        />
                        <button
                          onClick={() => removeCourse(year.id, semester.id, course.id)}
                          className="p-2 text-red-500 hover:text-red-700 transition-colors duration-200"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addCourse(year.id, semester.id)}
                      className="mt-2 flex items-center text-blue-500 hover:text-blue-700 transition-colors duration-200"
                    >
                      <PlusCircle size={20} className="mr-1" /> Add Course
                    </button>
                    <div className="mt-4 text-lg font-semibold text-blue-700">
                      Semester GPA: {calculateSemesterGPA(semester).toFixed(2)}
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => addSemester(year.id)}
                  className="mt-4 flex items-center text-blue-500 hover:text-blue-700 transition-colors duration-200"
                >
                  <PlusCircle size={20} className="mr-1" /> Add Semester
                </button>
                <div className="mt-4 text-xl font-bold text-blue-800">
                  Year GPA: {calculateYearGPA(year).toFixed(2)}
                </div>
              </>
            )}
          </div>
        ))}
        <div className="flex justify-center mb-8">
          <button
            onClick={addYear}
            className="bg-blue-500 text-white px-6 py-3 rounded-full hover:bg-blue-600 transition-colors duration-200 shadow-md"
          >
            Add Year
          </button>
        </div>
        <div className="mt-6 text-center bg-blue-600 p-6 rounded-lg shadow-lg">
          <h2 className="text-3xl font-bold text-white">Your Cumulative GPA: {calculateCumulativeGPA().toFixed(2)}</h2>
        </div>
      </div>
    </div>
  )
}

export default App